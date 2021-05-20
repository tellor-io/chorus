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
    event CollateralThreshold(uint256 _collateralThreshold);//emits if collateral threshold changes
    event CollateralPriceAge(uint256 _collateralPriceAge);//emits if collateral price age changes
    event Liquidate(
        address _party,
        uint256 _tokensAmnt,
        uint256 _collateralAmnt,
        uint256 _collateralPenalty
    );//emits upon a liquidation
    event LiquidationPenalty(uint256 _newPenalty);//emits when the liquidation penalty changes
    event MintTokens(
        address _holder,
        uint256 _amount,
        address _to,
        uint256 _collateralRatio
    );//emits when new tokens are minted
    event NewAdmin(address _newAdmin);//emits when a new admin is set
    event WithdrawCollateral(
        address _holder,
        uint256 _collateralAmnt,
        uint256 _collateralRatio
    );//emits when collateral is withdrawn
    event WithdrawToken(address _holder, uint256 _tokenAmnt, uint256 _collateralAmnt);//emits when tokens are withdrawn
    event WithdrawTokenRequest(address _user, uint256 _amount);
    
    /*Variables*/
    struct WithdrawDetails{
        uint256 amount;
        uint256 requestDate;
    }
    ERC20 public collateralToken;
    address public admin = msg.sender;
    uint256 private tknPrice = 1e18;
    uint256 public collateralID; // The collateral id used to check the Tellor oracle for its USD price.
    uint256 public collateralPriceGranularity; //usually 1000000 in the Tellor system
    uint256 public collateralThreshold = 15e17; // 150%.
    uint256 public collateralPriceAge = 3600; // e.g. 1hr.  This is the delay in the feed from Tellor
    uint256 public liquidationPenalty = 0;
    uint256 public inflRatePerSec;// The rate at which the token decreases value. 1e18 precision. 100e18 is 100%.
    uint256 public inflLastUpdate = block.timestamp;
    address public inflBeneficiary; // Where to send the inflation tokens.
    mapping(address => WithdrawDetails) withdrawRequested;

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
     * collateral token's requestID, the price granularity, the token name, 
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
        address _inflBeneficiary,
        bool _isWhitelisted
    )
        OracleGetter(_tellorAddress)
        ERC20(_tokenName, _tokenSymbol,_isWhitelisted)
        within100e18Range(_inflRatePerYear)
    {
        collateralID = _collateralID;
        collateralToken = ERC20(_collateralToken);
        collateralPriceGranularity = _collateralPriceGranularity;
        require(_collateralPriceGranularity > 0 && _collateralPriceGranularity <= 1e18, "value not within allowed limits");
        require(_inflBeneficiary != address(0), "beneficiary address not set");
        inflBeneficiary = _inflBeneficiary;
        inflRatePerSec = yearlyRateToPerSec(_inflRatePerYear);
    }

    /**
     * @dev Returns the current token price in USD reduced by the current inflation.
     * @return uint256 token price
     */
    function collateralBalance() external view returns (uint256) {
        return collateralToken.balanceOf(address(this));
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
        uint256 _collateralBalance = collateralToken.balanceOf(address(this));
        // slither-disable-next-line incorrect-equality
        if(totalSupply() == 0 || _collateralBalance == 0) {
            return 0;
        }
        uint256 _collateralValue = wmul(collateralPrice(), _collateralBalance);
        uint256 tokenSupplyWithInflInterest =
            accrueInterest(totalSupply(), inflRatePerSec, block.timestamp - inflLastUpdate);
        uint256 _tokenValue = wmul(tokenPrice(), tokenSupplyWithInflInterest);
        if(_tokenValue == 0){
            return 100e18;
        }
        return wdiv(_collateralValue,_tokenValue);
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

    function getWithdrawAmount(address _user) external view returns (uint256) {
        return withdrawRequested[_user].amount;
    }

    /**
     * @dev Function to allow anyone to liquidate the system if it is undercollateralized
     */
    function liquidate() external {
        require(
            collateralRatio() < collateralThreshold,
            "collateral utilization is above threshold"
        );
        require(
            (balanceOf(msg.sender) > 0) || (withdrawRequested[msg.sender].amount > 0),
            "msg sender doesn't own any tokens"
        );
        uint256 _tknSuplyRatio =
            wdiv(collateralToken.balanceOf(address(this)), totalSupply());
        uint256 _tokensToBurn = balanceOf(msg.sender);
        uint256 _collatAmt = wmul(_tokensToBurn, _tknSuplyRatio);
        uint256 _collatPenalty = wmul(_collatAmt, liquidationPenalty);
        emit Liquidate(msg.sender, _tokensToBurn, _collatAmt, _collatPenalty);
        _burn(msg.sender, _tokensToBurn);
        withdrawRequested[msg.sender].amount = 0;
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
     * @dev Allows the admin to mint tokens up to the collateral threshold
     * @param _amount the amount of collateral tokens to mint
     * @param _to   the address to mint them to;
     */
    function mintToken(uint256 _amount, address _to) external onlyAdmin {
        _mint(_to, _amount);
        uint256 _cRatio = collateralRatio();
        require(
            _cRatio >= collateralThreshold,
            "collateral utilization below the threshold"
        );
        emit MintTokens(msg.sender, _amount, _to, _cRatio);
    }

     /**
     * @dev Allows a user to request to withdraw tokens
     * @param _amount the amount of tokens to withdraw
     */
    function requestWithdrawToken(uint256 _amount) external {
        require(_amount > 0, "amount should be greater than 0");
        require(balanceOf(msg.sender) >= _amount, "not enough balance");
        withdrawRequested[msg.sender].requestDate = block.timestamp;
        withdrawRequested[msg.sender].amount += _amount;
        _transfer(msg.sender, address(this), _amount);
        emit WithdrawTokenRequest(msg.sender, _amount);
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
     * @dev Allows the admin to set the collateral price Age (delay in feed from Tellor)
     * @param _amount the amount of delay in the price feed (we want to wait for disputes)
     */
    function setCollateralPriceAge(uint256 _amount) external onlyAdmin {
        collateralPriceAge = _amount;
        emit CollateralPriceAge(_amount);
    }

    /**
     * @dev Allows the admin to set the Collateral threshold
     * @param _amount new collateral threshold
     */
    function setCollateralThreshold(uint256 _amount)
        external
        onlyAdmin
        within100e18Range(_amount) //between 0% and 10,000%
    {
        collateralThreshold = _amount;
        emit CollateralThreshold(_amount);
    }
    
    /**
     * @dev Allows the admin to set the liquidation penalty
     * @param _amount the amount of the liquidation penalty
     */
    function setLiquidationPenalty(uint256 _amount)
        external
        onlyAdmin
        within100e18Range(_amount)
    {
        liquidationPenalty = wdiv(_amount, 100e18); // Convert to a fraction.
        emit LiquidationPenalty(liquidationPenalty);
    }

    /**
     * @dev Returns the current token price in USD reduced by the current inflation.
     * @return uint256 token price
     */
    function tokenPrice() public view returns (uint256) {
        return
            accrueInflation(
                tknPrice,
                inflRatePerSec,
                block.timestamp - inflLastUpdate
            );
    }
    
    /**
     * @dev Function to reduce token price by the inflation rate,
     * increases the total supply by the inflation rate and
     * sends the new tokens to the inflation beneficiary.
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
        require(
            collateralToken.transfer(msg.sender, _amount),
            "collateral transfer fails"
        );
        uint256 _cRatio = collateralRatio();
        require(
            _cRatio >= collateralThreshold,
            "collateral utilization below the threshold"
        );
        // slither-disable-next-line reentrancy-events
        emit WithdrawCollateral(msg.sender, _amount, _cRatio);
    }

    /**
     * @dev Allows a user to withdraw tokens
     */
    function withdrawToken() external {
        WithdrawDetails memory wd = withdrawRequested[msg.sender];
        uint256 _amount = withdrawRequested[msg.sender].amount;
        require(_amount > 0, "amount should be greater than 0");
        uint256 _waitPeriod = 1 + 100 * _amount / totalSupply() / 5; //increases by 1 day for every 5 percent
        // slither-disable-next-line timestamp
        require(block.timestamp - wd.requestDate >= 86400 * _waitPeriod, "must wait to withdraw");
        withdrawRequested[msg.sender].amount = 0;
        uint256 _collatPrice = collateralPrice();
        uint256 _priceRatio = wdiv(tokenPrice(), _collatPrice);
        uint256 _collateralAmnt = wmul(_priceRatio, _amount);
        _burn(address(this), _amount);
        require(
            collateralToken.transfer(msg.sender, _collateralAmnt),
            "collateral transfer fail"
        );
        // slither-disable-next-line reentrancy-events
        emit WithdrawToken(msg.sender, _amount, _collateralAmnt);
    }
}
