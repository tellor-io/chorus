// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "usingtellor/contracts/UsingTellor.sol";
import "./Token.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


// The contract is also an ERC20 token which holds the collateral currency.
// It also holds the semi stable token state inside the `token` variable.
contract Main is ERC20, UsingTellor {
    using SafeMath for uint256;

    address             admin;
    uint256 constant    pctPrecision = 10000; // 10000 = 100% , 1 = 0.01%
    uint256 immutable   creationTimestamp = block.timestamp;

    Token private token;
    
    uint256         collateralID; // The id on Tellor oracle where to check the collateral token price. 
    uint256         collateralPricePrecision; // The id on Tellor oracle where to check the collateral token price.
    address payable collateralAddress;
    uint256         collateralThreshold;
    uint            collateralPriceAge;
    uint256         liquidationPenatly;

    // Inflation rate in basis points(1bsp=0.01%, 100bsp = 1%).
    // Set the rate at which the token decreases value.
    uint256         inflRate ; 
    uint256         inflPeriod; // Inflation increase every day by inflRate value.
    uint256         inflLastUpdate;
    address payable inflBeneficiary; // Where to send the inflation tokens.


    constructor(
        address payable _collateralAddress,
        uint256 _collateralID,
        uint256 _collateralThreshold,
        uint256 _collateralPricePrecision,
        uint256 _collateralPriceAge,
        uint256 _liquidationPenatly,
        address payable _inflBeneficiary,
        address payable TellorAddress,
        string memory collateralName,
        string memory collateralSymbol,
        string memory tokenName,
        string memory tokenSymbol
        ) UsingTellor(TellorAddress) ERC20(collateralName, collateralSymbol) withinPctRange(_liquidationPenatly) withinPctRange(_collateralThreshold)  {

        admin = msg.sender;
        // TODO Check if token ID is supported by the oracle and returns the price in USD.
        // For now assume that the contract creator knows what he is doing.
        // The collateral ID needs to return the value in USD.
        collateralID = _collateralID;
        collateralAddress = _collateralAddress;
        collateralThreshold = _collateralThreshold;
        collateralPricePrecision = _collateralPricePrecision;
        collateralPriceAge = _collateralPriceAge;
        liquidationPenatly = _liquidationPenatly;
        inflBeneficiary = _inflBeneficiary;
        inflLastUpdate = block.timestamp;
        inflPeriod = 86400;

        token = new Token(tokenName, tokenSymbol);
    }

    modifier onlyAdmin {
        require(
            msg.sender == admin,
            "Only admin can call this function."
        );
        _;
    }

    modifier withinPctRange(uint256 percent) {
        require(_withinPctRange(percent),"collateral threshold not within allowed limits");
        _;
    }

    function _withinPctRange(uint256 percent) internal pure returns(bool){
        return percent>=0 && percent < pctPrecision;
    }

    function depositCollateral(uint256 amount) external {
        require(amount > 0, "deposit amount 0");
        ERC20(collateralAddress).increaseAllowance(address(this),amount);
        ERC20(collateralAddress).transfer(address(this),amount);
    }

    // Anyone can deposit collateral, but only admin can withdraw.
    // Otherwise the logic for how much tokens a given collateral provider can mint becomes more complicated.
    // If we track the balance of each collateral provider then 
    // he should be allowed to mint up to the maximum amount based on his collateral deposit share.
    // Otherwise lets say a provider deposits 1ETH and mints all tokens to himself can drain the collateral of all providers.
    function withdrawCollateral(uint256 amount) external onlyAdmin{
        _burn(msg.sender,amount);
        require(collateralUtilization() < collateralThreshold,"withdraw will result the collateral utilizatoin below the collateral threshold");
        this.transfer(msg.sender, amount);
    }

    function withdrawTokens(uint256 amount) external{
        require(amount>0,"amount should be greater than 0");
        uint256 balance = token.balanceOf(msg.sender);
        require(balance > amount,"not enough balance");
        token.burn(msg.sender,balance);

        uint256 priceRatio = (getTokenPrice()*pctPrecision)/getCollateralPrice();
        uint256 pctOfCollateral = ( getCollateralPrice() * priceRatio ) /pctPrecision;
        uint256 amountOfCollateral = pctOfCollateral * balance;
        this.transfer(msg.sender, amountOfCollateral);
    }

    // Calculate how much percents of the total supply this sender owns and withdraw the same amount of percents  minus the penalty from the collateral.
    // Example:
    // token totalSupply is 10000, 
    // collateral totalSupply is 1000
    // sender owns 1000 (10% of token totalSupply)
    // with penatly 0% sender can withdraw 100 collateral(10% of collateral total supply)
    // with penatly 10% sender can withdraw 90 collateral
    function liquidate()external {
        require(collateralUtilization() > collateralThreshold,"can run a liquidation only when collateral utilizatoin is above the collateral threshold");
        uint256 totalSupplyRatio = (this.totalSupply()*pctPrecision)/token.totalSupply()  ;
        uint256 collateralAmount = (this.totalSupply()*totalSupplyRatio) / pctPrecision;
        uint256 collateralAmountP = collateralAmount- ((collateralAmount *liquidationPenatly) /pctPrecision);
        this.transfer(msg.sender, collateralAmountP);
    }

    // Increases the total supply and sends the new tokens to the inflation beneficiary.
    function updateInflation() public {
        require((block.timestamp - inflLastUpdate)> inflPeriod,"inflation period hasn't passed");
        uint256 inflIncrease = _inflation(inflLastUpdate);

        // Mint tokens amount that equals to the inflation increase.
        // inflIncrease is in percents basis points. 100% = 10 000 basis points.
        // TODO add tests for this.
        uint256 tokensToMint = (token.totalSupply()*inflIncrease) / pctPrecision;

        // Can be zero when token.totalSupply()*inflIncrease is below pctPrecision;
        if (tokensToMint>0){
            // Mint the amount of inflation to the inflBeneficiary address.
            token.mint(inflBeneficiary,tokensToMint);
            inflLastUpdate = block.timestamp;
        }
    }

    // Returns the inflation in percent with pctPrecision granularity.
    function _inflation(uint256 since) internal view returns(uint256){
        uint256 inflUnitPassed = (block.timestamp - since)/inflPeriod;
        return inflRate * inflUnitPassed;
    }
    
    // The maximum amount in percentage of collateral utilization.
    // Percents returned are with pctPrecision granularity.
    function collateralUtilization() public view returns (uint256){
        require(token.totalSupply()>0,"token total supply is zero");
        require(this.totalSupply()>0,"collateral total supply is zero");
        return  ( ( getTokenPrice() * token.totalSupply() * pctPrecision)  / (getCollateralPrice() * this.totalSupply() ) ) ; // TODO add test.
    }

    // Returns the collateral price in USD upscaled to e18 precision.
    function getCollateralPrice() public view returns (uint256){
        (bool   didGet, uint256 collateralPrice,uint256  timestamp) = getDataBefore(collateralID, block.timestamp-collateralPriceAge);
        require(didGet,"getting oracle price");
        require(!isInDispute(collateralID,timestamp),"current value is in dispute");

        return collateralPrice*(1e18/collateralPricePrecision);
    }

    // Returns the current token price in USD reduced by the current inflation.
    function getTokenPrice() public view returns (uint256){
        uint256 totalInflation =  _inflation(creationTimestamp);
        return 1e18-(1e18*totalInflation)/pctPrecision;
    }

    // WARNING You would usually want to put this through a vote from the token holders
    // or the collateral provider can set it very low and drain all collateral.
    // Usually the owner should be another contract so that it is allowed to change it only after a vote from the token holders.
    // Sets the collateral threshold with pctPrecision granulatiry.
    function setCollateralThreshold(uint256 percent) external onlyAdmin withinPctRange(percent){
        collateralThreshold = percent;
    }

    function setCollateralPriceAge(uint256 age)public onlyAdmin{
            collateralPriceAge = age;
    }

    // The max minted tokens can be up to the max utulization threshold.
    // Noone should be allowed to mint above the utilizationThreshold otherwise can drain the pool.
    function mint(uint256 amount, address to ) public onlyAdmin {
        token.mint(to,amount); // TODO Add e2e test to ensure that this is reverted when above the collateral threshold.
        require(collateralUtilization() < collateralThreshold,"minting tokens will cause collateral utilization to go above the allowed threshold");
    }
}
