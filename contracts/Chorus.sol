// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "./OracleGetter.sol";
import "./ERC20.sol";
import "./Inflation.sol";
import "hardhat/console.sol";

/** 
 @author Tellor Inc.
 @title Chorus
 @dev Chorus is a structure for issuing semi-stablecoins as community currencies
**/
// slither-disable-next-line missing-inheritance
contract Chorus is Inflation, OracleGetter, ERC20 {
    /*Events*/
    event CollateralThreshold(uint256);//emits if collateral threshold changes
    event CollateralPriceAge(uint256);//emits if collateral price age changes
    event Liquidate(
        address,
        uint256 tokensAmnt,
        uint256 collateralAmnt,
        uint256 collateralPenalty
    );//emits upon a liquidation
    event LiquidationPenatly(uint256);//emits when the liquidation penalty changes
    event WithdrawCollateral(
        address,
        uint256 collateralAmnt,
        uint256 collateralRatio
    );//emits when collateral is withdrawn
    event WithdrawToken(address, uint256 tokenAmnt, uint256 collateralAmnt);//emits when tokens are withdrawn
    event MintTokens(
        address,
        uint256 amount,
        address to,
        uint256 collateralRatio
    );//emits when new tokens are minted
    event NewAdmin(address _newAdmin);//emits when a new admin is set
    
    /*Variables*/
    ERC20 public collateralToken;
    address public admin = msg.sender;
    uint256 private tknPrice = 1e18;
    uint256 public collateralID; // The collateral id used to check the Tellor oracle for its USD price.
    uint256 public collateralPriceGranularity;
    uint256 public collateralThreshold = 15e17; // 150%.
    uint256 public collateralPriceAge = 3600; // 1h.
    uint256 public liquidationPenatly = 0;
    uint256 public inflRatePerSec;// The rate at which the token decreases value. 1e18 precision. 100e18 is 100%.
    uint256 public inflLastUpdate = block.timestamp;
    address public inflBeneficiary; // Where to send the inflation tokens.

    /*Modifiers*/
    modifier onlyAdmin {
        require(msg.sender == admin, "not an admin");
        _;
    }

    modifier within100e18Range(uint256 _value) {
        require(_value > 0 && _value < 100e18, "value not within allowed limits");
        _;
    }

    /*Functions*/
    /**
     * @dev This is the constructor, sets the inital paramaters in the system
     * The parameters include, the Tellor Address, collateral token's address,
     * collateral token's requestID, the price granualrity, the token name, 
     * token's symbol, inflation rate per year, and the inflation beneficiary 
     */
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
    {
        collateralID = _collateralID;
        collateralToken = ERC20(_collateralToken);
        collateralPriceGranularity = _collateralPriceGranularity;
        require(_collateralPriceGranularity > 0 && _collateralPriceGranularity <= 1e18, "value not within allowed limits");
        require(_inflBeneficiary != address(0), "benificiary address not set");
        inflBeneficiary = _inflBeneficiary;
        inflRatePerSec = yearlyRateToPerSec(_inflRatePerYear);
    }

    /**
     * @dev Checks the Tellor oracle and gets the collateral price
     * @return uint256 collateral price in USD upscaled to e18 precision.
     */
    // slither-disable-next-line timestamp
    function collateralPrice() public view returns (uint256) {
        (bool _didGet, uint256 _collateralPrice, ) =
            _getDataBefore(collateralID, block.timestamp - collateralPriceAge);
        require(_didGet, "getting oracle price");
        return mul(_collateralPrice, div(1e18, collateralPriceGranularity));
    }

    /**
     * @dev A view funciton to look at the collateralization of the system
     * @return uint256 collateral token balance of this address / totalSupply
     */
    function collateralRatio() public view returns (uint256) {
        return
            _collateralRatio(
                collateralToken.balanceOf(address(this)),
                totalSupply()
            );
    }

    /**
     * @dev Allows the admin to deposit collateral
     * @param _amount the amount of collateral token to deposit
     */
    function depositCollateral(uint256 _amount) external onlyAdmin {
        require(_amount > 0, "deposit amount 0");
        require(
            collateralToken.transferFrom(msg.sender, address(this), _amount),
            "failed collateral deposit transfer"
        );
    }

    /**
     * @dev Function to allow anyone to liquidate the system if it is undercollateralized
     */
    function liquidate() external {
        require(
            collateralRatio() > collateralThreshold,
            "collateral utilizatoin is below threshold"
        );
        require(balanceOf(msg.sender) > 0, "msg sender doesn't own any tokens");
        uint256 _tknSuplyRatio =
            wdiv(collateralToken.balanceOf(address(this)), totalSupply());
        uint256 _tokensToBurn = balanceOf(msg.sender);
        uint256 _collatAmt = wmul(_tokensToBurn, _tknSuplyRatio);
        uint256 _collatPenalty = wmul(_collatAmt, liquidationPenatly);
        emit Liquidate(msg.sender, _tokensToBurn, _collatAmt, _collatPenalty);
        _burn(msg.sender, _tokensToBurn);
        require(
            collateralToken.transfer(msg.sender, sub(_collatAmt, _collatPenalty)),
            "collateral liquidation transfer fails"
        );
        require(
            collateralToken.transfer(inflBeneficiary, _collatPenalty),
            "collateral liquidation penalty transfer fails"
        );
    }

    /**
     * @dev Allows the user to set a new admin address
     * @param _newAdmin the address of the new admin address
     */
    function setAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "cannot send to the zero address");
        admin = _newAdmin;
        emit NewAdmin(_newAdmin);
    }

    /**
     * @dev Function to reduce token price by the inflation rate,
     * increases the total supply by the inflation rate and
     * sends the new tokens to the inflation beneficiary.
     * @param _newAdmin the address of the new admin address
     */
    // slither-disable-next-line timestamp
    function updateInflation() external {
        uint256 secsPassed = block.timestamp - inflLastUpdate;
        require(secsPassed > 0, "no inflation increase yet");
        inflLastUpdate = block.timestamp;
        tknPrice = accrueInflation(tknPrice, inflRatePerSec, secsPassed);
        uint256 _tokensToMint =
            sub(
                accrueInterest(totalSupply(), inflRatePerSec, secsPassed),
                totalSupply()
            );
        _mint(inflBeneficiary, _tokensToMint);
    }

    /**
     * @dev Allows the admin to withdraw collateral above the threshold
     * @param _amount the amount of collateral token to deposit
     */
    function withdrawCollateral(uint256 _amount) external onlyAdmin {
        uint256 _cRatio =
            _collateralRatio(
                sub(collateralToken.balanceOf(address(this)), _amount),
                totalSupply()
            );
        // slither-disable-next-line missing-inheritance
        emit WithdrawCollateral(msg.sender, _amount, _cRatio);
        require(
            _cRatio < collateralThreshold,
            "collateral utilization above the threshold"
        );
        require(
            collateralToken.transfer(msg.sender, _amount),
            "collateral transfer fails"
        );
    }

    /*Internal Functions*/
    /**
     * @dev Internal function to return and check the collateral ratio
     * @param _collateralBalance balance of collateral in this contract
     * @param _tSupply totalSupply of the contract
     */
     //?? SEE IF WE CAN TAKE OUT
    function _collateralRatio(uint256 _collateralBalance, uint256 _tSupply)
        internal
        view
        returns (uint256)
    {
        require(_collateralBalance > 0, "collateral total supply is zero");
        if (_tSupply == 0) {
            return 0;
        }
        uint256 _collateralValue = wmul(collateralPrice(), _collateralBalance);
        uint256 tokenSupplyWithInflInterest =
            accrueInterest(_tSupply, inflRatePerSec, block.timestamp - inflLastUpdate);
        uint256 _tokenValue = wmul(tokenPrice(), tokenSupplyWithInflInterest);
        return add(1e18, wdiv(_tokenValue, _collateralValue));
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
