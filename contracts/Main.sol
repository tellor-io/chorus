// SPDX-License-Identifier: MIT
pragma solidity ^0.7.3;

import "usingtellor/contracts/UsingTellor.sol";
import "./Token.sol";
import "./Math.sol";
import "./Inflation.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// The contract is also an ERC20 token which holds the collateral currency.
// It also holds the semi stable token state inside the `token` variable.
contract Main is Inflation {
    event CollateralThreshold(uint256);
    event CollateralPriceAge(uint256);
    event LiquidationPenatly(uint256);
    event WithdrawCollateral(
        address,
        uint256 collateralAmnt,
        uint256 collateralUtilization
    );
    event WithdrawToken(address, uint256 tokenAmnt, uint256 collateralAmnt);
    event Liquidate(address, uint256 tokensAmnt, uint256 collateralAmnt);
    event MintTokens(
        address,
        uint256 amount,
        address to,
        uint256 collatUtilization
    );

    address public admin = msg.sender;

    Token private token;
    Token private collateral;
    uint256 private tknPrice = 1e18;

    UsingTellor tellor;

    uint256 public collateralID; // The id on Tellor oracle where to check the collateral token price.
    uint256 public collateralPriceGranularity;
    ERC20 public collateralToken;
    uint256 public collateralThreshold = 5e17; // 50%.
    uint256 public collateralPriceAge = 3600; // 1h.
    uint256 public liquidationPenatly = 0;

    // The rate at which the token decreases value.
    // 1e18 precision. 100e18 is 100%.
    uint256 public inflRatePerSec;
    uint256 public inflLastUpdate = block.timestamp;
    address public inflBeneficiary; // Where to send the inflation tokens.

    constructor(
        address payable _tellorAddress,
        address _collateralToken,
        uint256 _collateralID,
        uint256 _collateralPriceGranularity,
        string memory _collateralName,
        string memory _collateralSymbol,
        string memory _tokenName,
        string memory _tokenSymbol,
        uint256 _inflRatePerYear,
        address _inflBeneficiary
    )
        within100e18Range(_inflRatePerYear)
        within1e18Range(_collateralPriceGranularity)
    {
        // TODO Check if token ID is supported by the oracle and returns the price in USD.
        // For now assume that the contract creator knows what he is doing.
        // The collateral ID needs to return the value in USD.
        collateralID = _collateralID;
        collateralToken = ERC20(_collateralToken);
        collateralPriceGranularity = _collateralPriceGranularity;

        require(_inflBeneficiary != address(0), "benificiary address not set");
        inflBeneficiary = _inflBeneficiary;
        inflRatePerSec = yearlyRateToPerSec(_inflRatePerYear);

        token = new Token(_tokenName, _tokenSymbol);
        collateral = new Token(_collateralName, _collateralSymbol);

        tellor = new UsingTellor(_tellorAddress);
    }

    modifier onlyAdmin {
        require(msg.sender == admin, "not an admin");
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
        collateral.mint(msg.sender, amount);
        require(
            collateralToken.transferFrom(msg.sender, address(this), amount),
            "failed collateral deposit transfer"
        );
    }

    // Anyone can deposit collateral, but only admin can withdraw.
    // Otherwise the logic for how much tokens a given collateral provider can mint becomes more complicated.
    // If we track the balance of each collateral provider then
    // he should be allowed to mint up to the maximum amount based on his collateral deposit share.
    // Otherwise lets say a provider deposits 1ETH and mints all tokens to himself
    // can drain the collateral of all providers.
    function withdrawCollateral(uint256 withdrawAmount) external onlyAdmin {
        collateral.burn(msg.sender, withdrawAmount);
        uint256 collatUtilization = collateralUtilization();
        emit WithdrawCollateral(msg.sender, withdrawAmount, collatUtilization);
        require(
            collatUtilization < collateralThreshold,
            "collateral utilization above the threshold"
        );
        require(
            collateralToken.transfer(msg.sender, withdrawAmount),
            "collateral transfer fails"
        );
    }

    // Calculate how much percents of the total supply this sender owns and
    // can withdraw the same amount of percents minus the liquidation penalty.
    // Example:
    // token totalSupply is 10000,
    // collateral totalSupply is 1000
    // sender owns 1000 (10% of token totalSupply)
    // with penatly 0% sender can withdraw 100 collateral(10% of collateral total supply)
    // with penatly 10% sender can withdraw 90 collateral
    function liquidate() external {
        require(
            collateralUtilization() > collateralThreshold,
            "collateral utilizatoin is below threshold"
        );
        require(
            token.balanceOf(msg.sender) > 0,
            "msg sender doesn't own any tokens"
        );

        uint256 tsRatio = wdiv(collateral.totalSupply(), token.totalSupply());
        uint256 tokensToBurn = token.balanceOf(msg.sender);
        uint256 collatAmt = wmul(tokensToBurn, tsRatio);
        uint256 collatAmntWithPenalty =
            sub(collatAmt, wmul(collatAmt, liquidationPenatly));

        collateral.burn(admin, collatAmntWithPenalty);
        emit Liquidate(msg.sender, tokensToBurn, collatAmntWithPenalty);
        token.burn(msg.sender, tokensToBurn);

        require(
            collateralToken.transfer(msg.sender, collatAmntWithPenalty),
            "collateral liquidation transfer fails"
        );
    }

    // Reduce token price by the inflation rate,
    // increases the total supply by the inflation rate and
    // sends the new tokens to the inflation beneficiary.
    // TODO add tests for this.
    // slither-disable-next-line timestamp
    function updateInflation() external {
        uint256 secsPassed = block.timestamp - inflLastUpdate;
        require(secsPassed > 0, "no inflation increase yet");

        inflLastUpdate = block.timestamp;
        tknPrice = accrueInflation(tknPrice, inflRatePerSec, secsPassed);

        uint256 tokensToMint =
            sub(
                accrueInterest(token.totalSupply(), inflRatePerSec, secsPassed),
                token.totalSupply()
            );

        token.mint(inflBeneficiary, tokensToMint);
    }

    function collateralUtilization() public view returns (uint256) {
        require(
            collateral.totalSupply() > 0,
            "collateral total supply is zero"
        );
        if (token.totalSupply() == 0) {
            return 0;
        }

        uint256 collateralValue =
            wmul(collateralPrice(), collateral.totalSupply());

        uint256 secsPassed = block.timestamp - inflLastUpdate;
        uint256 tokenSupplyWithInflInterest =
            accrueInterest(token.totalSupply(), inflRatePerSec, secsPassed);

        uint256 tokenValue = wmul(tokenPrice(), tokenSupplyWithInflInterest);

        return wdiv(tokenValue, collateralValue);
    }

    // Returns the collateral price in USD upscaled to e18 precision.
    function collateralPrice() public view returns (uint256) {
        (bool _didGet, uint256 _collateralPrice, ) =
            tellor.getDataBefore(
                collateralID,
                block.timestamp - collateralPriceAge
            );
        require(_didGet, "getting oracle price");
        return mul(_collateralPrice, div(1e18, collateralPriceGranularity));
    }

    // WARNING You would usually want to put this through a vote from the token holders
    // or the collateral provider can set it very low and drain all collateral.
    // Usually the owner should be another contract so that
    // it is allowed to change it only after a vote from the token holders.
    function setCollateralThreshold(uint256 value)
        external
        onlyAdmin
        within100e18Range(value)
    {
        collateralThreshold = value;
        emit CollateralThreshold(value);
    }

    function setCollateralPriceAge(uint256 value) external onlyAdmin {
        collateralPriceAge = value;
        emit CollateralPriceAge(value);
    }

    function setLiquidationPenatly(uint256 value)
        external
        onlyAdmin
        within100e18Range(value)
    {
        liquidationPenatly = value;
        emit LiquidationPenatly(value);
    }

    // The max minted tokens can be up to the max utulization threshold.
    // Noone should be allowed to mint above the utilizationThreshold otherwise can drain the pool.
    function mintToken(uint256 amount, address to) external onlyAdmin {
        token.mint(to, amount);
        uint256 collatUtilization = collateralUtilization();
        emit MintTokens(msg.sender, amount, to, collatUtilization);
        require(
            collatUtilization < collateralThreshold,
            "collateral utilization above the threshold"
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

    function tokenTotalSupply() external view returns (uint256) {
        return token.totalSupply();
    }

    function collateralTotalSupply() external view returns (uint256) {
        return collateral.totalSupply();
    }

    function balanceOf(address a) external view returns (uint256) {
        return collateral.balanceOf(a);
    }

    function withdrawToken(uint256 amount) external {
        require(amount > 0, "amount should be greater than 0");
        require(token.balanceOf(msg.sender) >= amount, "not enough balance");

        uint256 collatPrice = collateralPrice();
        uint256 priceRatio = wdiv(tokenPrice(), collatPrice);
        uint256 collateralAmnt = wmul(priceRatio, amount);

        collateral.burn(admin, collateralAmnt);
        emit WithdrawToken(msg.sender, amount, collateralAmnt);

        require(
            collateralToken.transfer(msg.sender, collateralAmnt),
            "collateral transfer fail"
        );
        token.burn(msg.sender, amount);
    }

    function tokenBalanceOf(address account) external view returns (uint256) {
        return token.balanceOf(account);
    }
}
