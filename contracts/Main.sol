// SPDX-License-Identifier: MIT
pragma solidity ^0.7.3;

import "usingtellor/contracts/UsingTellor.sol";
import "./Token.sol";
import "./Math.sol";
import "./Inflation.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

// The contract is also an ERC20 token which holds the collateral currency.
// It also holds the semi stable token state inside the `token` variable.
contract Main is ERC20, UsingTellor, Inflation {
    address public admin = msg.sender;

    uint256 immutable creationTimestamp = block.timestamp;

    Token private token;
    uint256 tknPrice = 1e18;

    uint256 public collateralID; // The id on Tellor oracle where to check the collateral token price.
    uint256 public collateralPriceGranularity;
    ERC20 public collateralToken;
    uint256 public collateralThreshold = 5e17; // 50%.
    uint256 public collateralPriceAge = 3600; // 1h.
    uint256 public liquidationPenatly = 0;

    // The rate at which the token decreases value.
    // 1e18 precision. 100e18 is 100%.
    uint256 inflRatePerSec;
    uint256 public inflLastUpdate = block.timestamp;
    address inflBeneficiary; // Where to send the inflation tokens.

    constructor(
        address _collateralToken,
        uint256 _collateralID,
        uint256 _collateralPriceGranularity,
        address _inflBeneficiary,
        address payable _tellorAddress,
        string memory _collateralName,
        string memory _collateralSymbol,
        string memory _tokenName,
        string memory _tokenSymbol,
        uint256 _inflRatePerYear
    )
        UsingTellor(_tellorAddress)
        ERC20(_collateralName, _collateralSymbol)
        within100e18Range(_inflRatePerYear)
        within1e18Range(_collateralPriceGranularity)
    {
        // TODO Check if token ID is supported by the oracle and returns the price in USD.
        // For now assume that the contract creator knows what he is doing.
        // The collateral ID needs to return the value in USD.
        collateralID = _collateralID;
        collateralToken = ERC20(_collateralToken);
        collateralPriceGranularity = _collateralPriceGranularity;

        inflBeneficiary = _inflBeneficiary;
        inflRatePerSec = yearlyRateToPerSec(_inflRatePerYear);

        token = new Token(_tokenName, _tokenSymbol);
    }

    modifier onlyAdmin {
        require(msg.sender == admin, "Only admin can call this function.");
        _;
    }

    modifier within100e18Range(uint256 value) {
        require(value > 0 && value < 100e18, "value not within allowed limits");
        _;
    }

    modifier within1e18Range(uint256 value) {
        require(value > 0 && value <= 1e18, "value not within allowed limits");
        _;
    }

    function depositCollateral(uint256 amount) external onlyAdmin {
        require(amount > 0, "deposit amount 0");
        _mint(msg.sender, amount);
        collateralToken.transferFrom(msg.sender, address(this), amount);
    }

    // Anyone can deposit collateral, but only admin can withdraw.
    // Otherwise the logic for how much tokens a given collateral provider can mint becomes more complicated.
    // If we track the balance of each collateral provider then
    // he should be allowed to mint up to the maximum amount based on his collateral deposit share.
    // Otherwise lets say a provider deposits 1ETH and mints all tokens to himself can drain the collateral of all providers.
    function withdrawCollateral(uint256 amount) external onlyAdmin {
        _burn(msg.sender, amount);
        require(
            collateralUtilization() < collateralThreshold,
            "withdraw will result the collateral utilizatoin below the collateral threshold"
        );
        transfer(msg.sender, amount);
    }

    // Calculate how much percents of the total supply this sender owns and withdraw the same amount of percents  minus the penalty from the collateral.
    // Example:
    // token totalSupply is 10000,
    // collateral totalSupply is 1000
    // sender owns 1000 (10% of token totalSupply)
    // with penatly 0% sender can withdraw 100 collateral(10% of collateral total supply)
    // with penatly 10% sender can withdraw 90 collateral
    function liquidate() external {
        require(
            collateralUtilization() > collateralThreshold,
            "can run a liquidation only when collateral utilizatoin is above the collateral threshold"
        );
        uint256 tsRatio = wdiv(totalSupply(), token.totalSupply());
        uint256 collAmt = wmul(totalSupply(), tsRatio);
        uint256 collAmtPenalty =
            sub(collAmt, wmul(collAmt, liquidationPenatly));
        transfer(msg.sender, collAmtPenalty);
    }

    // Reduce token price by the inflation rate,
    // increases the total supply by the inflation rate and
    // sends the new tokens to the inflation beneficiary.
    // TODO add tests for this.
    function updateInflation() public {
        uint256 secsPassed = block.timestamp - inflLastUpdate;
        require(secsPassed > 0, "no inflation increase yet");

        inflLastUpdate = block.timestamp;
        tknPrice = accrueInflation(tknPrice, inflRatePerSec, secsPassed);

        uint256 tokensToMint =
            accrueInterest(token.totalSupply(), inflRatePerSec, secsPassed);
        token.mint(inflBeneficiary, tokensToMint);
    }

    function collateralUtilization() public view returns (uint256) {
        require(totalSupply() > 0, "collateral total supply is zero");
        if (token.totalSupply() == 0) {
            return 0;
        }

        uint256 collateralValue = wmul(collateralPrice(), totalSupply());

        uint256 secsPassed = block.timestamp - inflLastUpdate;
        uint256 tokenSupplyWithInflInterest =
            accrueInterest(token.totalSupply(), inflRatePerSec, secsPassed);

        uint256 tokenValue = wmul(tokenPrice(), tokenSupplyWithInflInterest);

        return wdiv(tokenValue, collateralValue);
    }

    // Returns the collateral price in USD upscaled to e18 precision.
    function collateralPrice() public view returns (uint256) {
        (bool _didGet, uint256 _collateralPrice, ) =
            getDataBefore(collateralID, block.timestamp - collateralPriceAge);
        require(_didGet, "getting oracle price");
        return mul(_collateralPrice, div(1e18, collateralPriceGranularity));
    }

    // WARNING You would usually want to put this through a vote from the token holders
    // or the collateral provider can set it very low and drain all collateral.
    // Usually the owner should be another contract so that it is allowed to change it only after a vote from the token holders.
    function setCollateralThreshold(uint256 value)
        external
        onlyAdmin
        within100e18Range(value)
    {
        collateralThreshold = value;
    }

    function setCollateralPriceAge(uint256 value) public onlyAdmin {
        collateralPriceAge = value;
    }

    function setLiquidationPenatly(uint256 value)
        external
        onlyAdmin
        within100e18Range(value)
    {
        liquidationPenatly = value;
    }

    // The max minted tokens can be up to the max utulization threshold.
    // Noone should be allowed to mint above the utilizationThreshold otherwise can drain the pool.
    function mintToken(uint256 amount, address to) public onlyAdmin {
        token.mint(to, amount);
        require(
            collateralUtilization() < collateralThreshold,
            "minting tokens will cause collateral utilization to go above the allowed threshold"
        );
    }

    // Returns the current token price in USD reduced by the current inflation.
    function tokenPrice() public view returns (uint256) {
        return
            accrueInflation(
                tknPrice,
                inflRatePerSec,
                block.timestamp - inflLastUpdate
            );
    }

    function tokenTotalSupply() public view returns (uint256) {
        return token.totalSupply();
    }

    // TODO add test
    function withdrawToken(uint256 amount) external {
        require(amount > 0, "amount should be greater than 0");
        uint256 balance = token.balanceOf(msg.sender);
        require(balance > amount, "not enough balance");

        uint256 priceRatio = wdiv(tokenPrice(), collateralPrice());
        uint256 pctOfCollateral = wmul(collateralPrice(), priceRatio);
        uint256 amountOfCollateral = wmul(pctOfCollateral, balance);

        token.burn(msg.sender, balance);
        transfer(msg.sender, amountOfCollateral);
    }
}
