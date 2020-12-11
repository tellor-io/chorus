// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "./Token.sol";
import "usingtellor/contracts/UsingTellor.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


// The contract is also an ERC20 token which holds the collateral currency.
// It also holds the semi stable token state inside the `token` variable.
contract Main is SafeERC20, UsingTellor {
    using SafeMath for uint256;

    address admin;
    
    uint256         collateralID; // The id on Tellor oracle where to check the collateral token price. 
    uint256         collateralPricePrecision; // The id on Tellor oracle where to check the collateral token price.
    address payable collateralAddress; // The currency 
    uint256         collateralThreshold;

    // Inflation rate per day in basis points(1bsp=0.01%, 100bsp = 1%). 
    // Set the rate at which the token decreases value.
    uint256             inflRate ; 
    uint256             inflPeriod; // Inflation increase every day by inflRate value.
    uint256 constant    pctPrecision = 10000; // 10000 = 100% , 1 = 0.01%
    uint256             tokenPrice; // Pegged to USD 18 decimal points.
    uint256             inflLastUpdate;
    address payable     inflBeneficiary; // Where to send the tokens

    token Token;



    constructor(
        address payable _collateralAddress, 
        uint256 _collateralID,
        uint256 _collateralThreshold,
        uint256 _collateralPricePrecision,
        address payable _inflBeneficiary,
        address payable TellorAddress) UsingTellor(TellorAddress)  {

        admin = msg.sender;
        collateralAddress = _collateralAddress;
        collateralThreshold = _collateralThreshold;
        collateralPricePrecision = _collateralPricePrecision;
        inflBeneficiary = _inflBeneficiary;
        collateralID = _collateralID;
        // TODO Check if token ID is supported by the oracle;
        // For now hard code the accepted request IDs anly only accept those that are peged to USD.
        inflLastUpdate = block.timestamp;
        inflPeriod = 86400;
        tokenPrice = 1e18;
    }

    modifier onlyAdmin {
        require(
            msg.sender == admin,
            "Only admin can call this function."
        );
        _;
    }

    function depositCollateral(uint256 amount) external {
        require(amount > 0, "deposit amount 0");
        SafeERC20(collateralTokenAddr).safeTransferFrom(msg.sender,address(this),amount);
    }

    // Anyone can deposit collateral, but only admin can withdraw.
    // Otherwise the logic for how much tokens a given collateral provider can mint becomes more complicated.
    // If we track the balance of each collateral provider then 
    // he should be allowed to mint up to the maximum amount based on his collateral deposit share.
    // Otherwise lets say a provider deposits 1ETH and mints all tokens to himself can drain the collateral of all providers.
    function withdrawCollateral(uint256 amount) external onlyAdmin{

    }

    function withdrawTokens(uint256 amount) external returns (uint256){
        require(amount>0,"amount should be greater than 0");
        uint256 balance = token.balanceOf(msg.sender);
        require(balance > amount,"not enough balance");
        token._burn(msg.sender,balance);

        priceRatio = (tokenPrice*pctPrecision)/getCollateralPrice();
        pctOfCollateral = ( getCollateralPrice() * priceRatio ) /pctPrecision;
        amountOfCollateral = pctOfCollateral * balance;
        safeTransfer(msg.sender, amountOfCollateral);
    }

    function liquidate(uint256 amount)external returns (uint256){
        require(collateralUtilization() > collateralThreshold,"can run a liquidation only when collateral utilizatoin is above the collateral threshold");
        // Calculate how much percents of the total supply this sender owns and withdraw the same amount or percents from the collateral.
        // Example:
        // token totalSupply is 10000, 
        // collateral totalSupply is 1000
        // sender owns 100 (1% of token totalSupply)
        // sender can withdraw 10 collateral(1% of collateral total supply)
    }

    // Increases the total supply and sends the new tokens to the inflation beneficiary.
    function updateInflation() public {
        require((block.timestamp - inflLastUpdate)> inflPeriod,"inflation period hasn't passed");
        daysPassed = (block.timestamp - inflLastUpdate)/inflPeriod;
        inflIncrease = inflRate * daysPassed;

        // Mint tokens amount that equals to the inflation increase.
        // inflIncrease is in percents basis points. 100% = 10 000 basis points.
        // TODO add tests for this.
        tokensToMint = (token.totalSupply()*inflIncrease)/pctPrecision;

        // Can be zero when token.totalSupply()*inflIncrease is below pctPrecision;
        if (tokensToMint>0){
            // Mint the amount of inflation to the inflBeneficiary address.
            token.mint(tokensToMint, inflBeneficiary);
            inflLastUpdate = block.timestamp;
        }
    }
    
    // The maximum amount in percentage of collateral utilization.
    // Percents returned are with pctPrecision granularity.
    function collateralUtilization() public view returns (uint256){
        return  ( (tokenPrice * token.totalSupply() * pctPrecision)  / (getCollateralPrice() * totalSupply() ) ) ; // TODO add test.
    }

    // Returns the current collateral price in USD upscaled to e18 precision.
    function getCollateralPrice() public returns (uint256){
        (didGet, collateralPrice, timestamp) = getCurrentValue(collateralID);
        require(didGet,"getting oracle price");
        require(!isInDispute(collateralID,timestamp),"current value is in dispute");

        return collateralPrice*collateralPricePrecision;
    }

    // Sets the collateral threshold with pctPrecision granulatiry.
    // TODO Should go trough a vote. Otherwise the provider can set it very low and drain all collateral.
    function setCollateralThreshold(uint256 percent) external onlyAdmin{
        require(percent>0 && percent < pctPrecision,"collateral threshold not within allowed limits");
        collateralThreshold = percent;
    }


    // The max minted tokens can be up to the max utulization threshold.
    // Noone should be allowed to mint above the utilizationThreshold otherwise can drain the pool.
    function mint(uint256 amount, address to ) public onlyAdmin {
        token.mint(amount, to); // TODO Add e2e test to ensure that this is reverted when above the collateral threshold.
        require(collateralUtilization() < collateralThreshold,"minting tokens will cause collateral utilization to go above the allowed threshold");
    }
}
