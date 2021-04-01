// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "./OracleGetter.sol";
import "./ERC20.sol";
import "./Inflation.sol";

import "hardhat/console.sol";

contract Chorus is Inflation, OracleGetter, ERC20 {
    event CollateralThreshold(uint256);
    event CollateralPriceAge(uint256);
    event LiquidationPenatly(uint256);
    event WithdrawCollateral(
        address,
        uint256 collateralAmnt,
        uint256 collateralRatio
    );
    event WithdrawToken(address, uint256 tokenAmnt, uint256 collateralAmnt);
    event Liquidate(
        address,
        uint256 tokensAmnt,
        uint256 collateralAmnt,
        uint256 collateralPenalty
    );
    event MintTokens(
        address,
        uint256 amount,
        address to,
        uint256 collateralRatio
    );

    address public admin = msg.sender;
    uint256 private tknPrice = 1e18;

    uint256 public collateralID; // The collateral id used to check the Tellor oracle for its USD price.
    uint256 public collateralPriceGranularity;
    ERC20 public collateralToken;
    uint256 public collateralThreshold = 15e17; // 150%.
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
        string memory _tokenName,
        string memory _tokenSymbol,
        uint256 _inflRatePerYear,
        address _inflBeneficiary
    )
        OracleGetter(_tellorAddress)
        ERC20(_tokenName, _tokenSymbol)
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

    function setAdmin(address _newAdmin) external onlyAdmin{
        admin = _newAdmin;
    }

    
    function depositCollateral(uint256 wad) external onlyAdmin {
        require(wad > 0, "deposit amount 0");
        require(
            collateralToken.transferFrom(msg.sender, address(this), wad),
            "failed collateral deposit transfer"
        );
    }

    // Anyone can deposit collateral, but only admin can withdraw.
    // Otherwise the logic for how much tokens a given collateral provider can mint becomes more complicated.
    // If we track the balance of each collateral provider then
    // he should be allowed to mint up to the maximum amount based on his collateral deposit share.
    // Otherwise lets say a provider deposits 1ETH and mints all tokens to himself
    // can drain the collateral of all providers.
    function withdrawCollateral(uint256 wad) external onlyAdmin {
        uint256 cRatio =
            _collateralRatio(
                sub(collateralToken.balanceOf(address(this)), wad),
                totalSupply()
            );
        // slither-disable-next-line reentrancy-events
        emit WithdrawCollateral(msg.sender, wad, cRatio);
        require(
            cRatio < collateralThreshold,
            "collateral utilization above the threshold"
        );
        require(
            collateralToken.transfer(msg.sender, wad),
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
            collateralRatio() > collateralThreshold,
            "collateral utilizatoin is below threshold"
        );
        require(balanceOf(msg.sender) > 0, "msg sender doesn't own any tokens");

        uint256 tknSuplyRatio =
            wdiv(collateralToken.balanceOf(address(this)), totalSupply());
        uint256 tokensToBurn = balanceOf(msg.sender);
        uint256 collatAmt = wmul(tokensToBurn, tknSuplyRatio);
        uint256 collatPenalty = wmul(collatAmt, liquidationPenatly);
        uint256 collatAmntMinusPenalty = sub(collatAmt, collatPenalty);

        emit Liquidate(msg.sender, tokensToBurn, collatAmt, collatPenalty);
        _burn(msg.sender, tokensToBurn);
        require(
            collateralToken.transfer(msg.sender, collatAmntMinusPenalty),
            "collateral liquidation transfer fails"
        );
        require(
            collateralToken.transfer(inflBeneficiary, collatPenalty),
            "collateral liquidation penalty transfer fails"
        );
    }

    // Reduce token price by the inflation rate,
    // increases the total supply by the inflation rate and
    // sends the new tokens to the inflation beneficiary.
    // slither-disable-next-line timestamp
    function updateInflation() external {
        uint256 secsPassed = block.timestamp - inflLastUpdate;
        require(secsPassed > 0, "no inflation increase yet");

        inflLastUpdate = block.timestamp;
        tknPrice = accrueInflation(tknPrice, inflRatePerSec, secsPassed);

        uint256 tokensToMint =
            sub(
                accrueInterest(totalSupply(), inflRatePerSec, secsPassed),
                totalSupply()
            );

        _mint(inflBeneficiary, tokensToMint);
    }

    function collateralRatio() public view returns (uint256) {
        return
            _collateralRatio(
                collateralToken.balanceOf(address(this)),
                totalSupply()
            );
    }

    function _collateralRatio(uint256 _collateralBalance, uint256 _tSupply)
        internal
        view
        returns (uint256)
    {
        require(_collateralBalance > 0, "collateral total supply is zero");
        if (_tSupply == 0) {
            return 0;
        }

        uint256 collateralValue = wmul(collateralPrice(), _collateralBalance);

        uint256 secsPassed = block.timestamp - inflLastUpdate;
        uint256 tokenSupplyWithInflInterest =
            accrueInterest(_tSupply, inflRatePerSec, secsPassed);

        uint256 tokenValue = wmul(tokenPrice(), tokenSupplyWithInflInterest);

        return add(1e18, wdiv(tokenValue, collateralValue));
    }

    // Returns the collateral price in USD upscaled to e18 precision.
    // slither-disable-next-line timestamp
    function collateralPrice() public view returns (uint256) {
        (bool _didGet, uint256 _collateralPrice, ) =
            _getDataBefore(collateralID, block.timestamp - collateralPriceAge);
        require(_didGet, "getting oracle price");
        return mul(_collateralPrice, div(1e18, collateralPriceGranularity));
    }

    // WARNING You would usually want to put this through a vote from the token holders
    // or the collateral provider can set it very low and drain all collateral.
    // Usually the owner should be another contract so that
    // it is allowed to change it only after a vote from the token holders.
    function setCollateralThreshold(uint256 wad)
        external
        onlyAdmin
        within100e18Range(wad)
    {
        collateralThreshold = wad;
        emit CollateralThreshold(wad);
    }

    function setCollateralPriceAge(uint256 wad) external onlyAdmin {
        collateralPriceAge = wad;
        emit CollateralPriceAge(wad);
    }

    // WARNING You would usually want to put this through a vote from the token holders
    // or the admin can set it at 100% and during liquidation token holders will not receive any collateral.
    function setLiquidationPenatly(uint256 wad)
        external
        onlyAdmin
        within100e18Range(wad)
    {
        liquidationPenatly = wdiv(wad, 100e18); // Convert to a fraction.
        emit LiquidationPenatly(liquidationPenatly);
    }

    // The max minted tokens can be up to the max utulization threshold.
    // Noone should be allowed to mint above the utilizationThreshold otherwise can drain the pool.
    function mintToken(uint256 amount, address to) external onlyAdmin {
        _mint(to, amount);
        uint256 cRatio = collateralRatio();
        // slither-disable-next-line reentrancy-events
        emit MintTokens(msg.sender, amount, to, cRatio);
        require(
            cRatio < collateralThreshold,
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

    function collateralBalance() external view returns (uint256) {
        return collateralToken.balanceOf(address(this));
    }

    function withdrawToken(uint256 amount) external {
        require(amount > 0, "amount should be greater than 0");
        require(balanceOf(msg.sender) >= amount, "not enough balance");

        uint256 collatPrice = collateralPrice();
        uint256 priceRatio = wdiv(tokenPrice(), collatPrice);
        uint256 collateralAmnt = wmul(priceRatio, amount);

        emit WithdrawToken(msg.sender, amount, collateralAmnt);
        _burn(msg.sender, amount);

        require(
            collateralToken.transfer(msg.sender, collateralAmnt),
            "collateral transfer fail"
        );
    }
}
