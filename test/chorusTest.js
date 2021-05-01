const { expect, assert } = require("chai");
const { default: Decimal } = require("decimal.js");

//eth addresses
let owner, acc1, acc2, acc3, acc4, beneficiary; //eth accounts used by tests
let oracle, chorus, collateralTkn; //eth contracts used by tests

//contract constructor arguments
const tokenPrecision = BigInt(1e18) //token contract float precision (standard)
const collateralPrice = 100 //price of collateral token
const oraclePricePrecision = 1e6 //precision of oracle's token price data
const secsPerYear = 365*24*60*60
const nominalInflationRateYear = 0.1 // 0.1 = 10%
const effectiveInflationRate = nominalToEffectiveInflation(new Decimal(nominalInflationRateYear))
const inflationRate = new Decimal(effectiveInflationRate).mul(1e18) //effective inflation rate (formatted for solidity)
const inflationRatePerSec = ((inflationRate / 1e10) / (secsPerYear * 10e7))
const notePrice = 1e18

var evmCurrentBlockTime = Math.round((Number(new Date().getTime())) / 1000)
// The most accurate way to calculate inflation is a loop with
// for (let i = 0; i < secsPassed; i++) {
//  `tokenPrice -= tokenPrice * inflRatePerSec`
// }
// but this is too slow so will an algorithm that has a very small precision error.
// div(_principal, pow(1+_rate, _age));
// https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b
function accrueInflation(principal, secsPassed, inflPerSec = inflRatePerSec) {
  let rate = 1 + inflPerSec;
  infl = principal / rate ** secsPassed
  return BigInt(infl);
}

function accrueInterest(principal, secsPassed) {
  let rate = 1 + inflRatePerSec;
  interest = principal * (rate ** secsPassed)
  return BigInt(interest - principal);
}


function nominalToEffectiveInflation(nominal) {
  let secsPerYearD = new Decimal(secsPerYear)
  let base = new Decimal(1.0).add(nominal.div(secsPerYearD))
  let j = base.pow(secsPerYearD)
  let k = j.sub(new Decimal(1.0))
  return k
}

/** 'beforeEach' will run before each test.
 *  
 *  It re-deploys the contract every time.
 *  Redeploying the contract resets the state,
 *  so that test processes don't affect each other.
 *  
 *  It receives a callback, which can be async.
 * 
*/
beforeEach(async function() {
  //Using deployments.createFixture speeds up the tests as
  //the reset is done with evm_revert

  //setup test contracts
  let testContracts = await setupTest()
  oracle = testContracts.oracle
  collateralTkn = testContracts.collateralTkn
  chorus = testContracts.chorus
})

const setupTest = deployments.createFixture(
  async ({ deployments, getNamedAccounts, ethers }, options) => {
      //create dummy ethereum accounts for common Chorus contract roles
      let users = [owner, acc1, acc2, acc3, acc4, beneficiary] = await ethers.getSigners();
      //deploy test Tellor oracle
      let oracleDepl = await deployments.deploy('MockOracle', {
          from: owner.address,
      })
      //connect to test Tellor oracle contract
      let oracle = await ethers.getContract("MockOracle")
      //deploy test ERC20 collateral token contract (arbitrary token)
      let collateralDepl = await deployments.deploy('Token', {
          from: owner.address,
          args: [
              "myToken", //arbitrary name
              "TKN", //arbitrary symbol
              false
          ]
      })
      //connect to test ERC20 collateral token contract
      let collateralTkn = await ethers.getContract("Token")
      //deploy test Chorus contract
      await deployments.deploy('Chorus', {
          from: owner.address,
          //Chorus constructor arguments, see contracts/Chorus.sol
          args: [
              oracleDepl.address,
              collateralDepl.address,
              1, 
              oraclePricePrecision,
              "Anthem", //anthem name (arbitrary)
              "ANT", //anthem symbol (arbitrary)
              BigInt(Math.floor(inflationRate)).toString(),
              beneficiary.address,
              false
          ]
      })
      //connect to test Chorus Anthem contract
      let chorus = await ethers.getContract("Chorus")
      //Prepare the inital state of the contracts
      //Add price and rewind the evm
      //as the evm uses a price at least collateralPriceAge old (the Tellor feed delay)
      await oracle.submitValue(1, collateralPrice * oraclePricePrecision)
      evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 500
      await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
      await waffle.provider.send("evm_mine")
      //give dummy users some collateral token
      users.forEach(function(user) {
        await collateralTkn.mint(user.address, 10n*tokenPrecision)
        //doublecheck that dummy users now have collateral
        assert(await collateralTkn.balanceOf(user.address) == 10n*tokenPrecision,
               "users were not minted collateral as expected")
      })
      await collateralTkn.increaseAllowance(chorus.address, BigInt(1e50))
      //return test contracts
      return { oracle, collateralTkn, chorus }
})

describe("Chorus tests", function () {
  it("Token Inflation", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision)
    let mintedTokens = 100n * precision
    await chorus.mintToken(mintedTokens, acc1.address)
    evmCurrentBlockTime += secsPerYear;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let secsPassed = evmCurrentBlockTime - Number(await chorus.inflLastUpdate())
    let actPrice = Number(await chorus.tokenPrice())
    let expPrice = Number(accrueInflation(tokenPrice, secsPassed))
    // There is a rounding error so ignore the difference after the rounding error.
    expect(expPrice).to.be.closeTo(actPrice, 1600000000)
  });

  it("Effective Rate", async function () {
    let currPrice = await chorus.tokenPrice()
    var evmCurrentBlockTime = Math.round((Number(new Date().getTime())) / 1000);
    evmCurrentBlockTime += secsPerYear;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let actPrice = Number(await chorus.tokenPrice())
    // There is a rounding error so ignore the difference after the rounding error.
    // The total precision is enough that this rounding shouldn't matter.
    expect(currPrice - (currPrice * nominalRateYear)).to.be.closeTo(actPrice, 200000000000000)
  });

  it("Minting tokens to the inflation beneficiary", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision)
    let mintedTokens = 100n * precision
    await chorus.mintToken(mintedTokens, acc1.address)
    evmCurrentBlockTime += secsPerYear;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let secsPassed = evmCurrentBlockTime - Number(await chorus.inflLastUpdate())
    expect(await chorus.balanceOf(benificiary.address)).to.equal(0) // Start with 0
    let expInflBeneficiaryTokens = Number(accrueInterest(await chorus.totalSupply(), secsPassed))
    await chorus.updateInflation()
    let actInflBeneficiaryTokens = Number(await chorus.balanceOf(benificiary.address))
    // There is a rounding error so ignore the difference after the rounding error.
    // The total precision is enough that this rounding shouldn't matter.
    expect(actInflBeneficiaryTokens).to.be.closeTo(expInflBeneficiaryTokens, 20000000000000)
  })

  it("Collateral deposit and ratio", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision) //deposit 10 *100$ = 1,000
    expect(await collateral.balanceOf(chorus.address)).to.equal(collateralDeposit * precision)
    expect(await chorus.collateralRatio()).to.equal(0)
    let tokensMinted = 499n; //Mint 500 tokens
    await chorus.mintToken(tokensMinted * precision, acc1.address)
    expect(tokensMinted).to.equal(BigInt(await chorus.totalSupply()) / precision)
    let totalTokenValue = Number(tokensMinted) * tokenPrice
    let collateralValue = collateralDeposit * BigInt(collateralPrice) * precision
    let expcollateralRatio = 100* Number(collateralValue)/totalTokenValue 
    let actcollateralRatio = (Number(await chorus.collateralRatio()) / Number(precision) * 100)
    expect(expcollateralRatio).to.be.closeTo(actcollateralRatio,.001)
  });

  it("Should not allow minting tokens above the collateral threshold", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision)
    expect(await chorus.collateralRatio()).to.equal(0)
    let tokensMinted = 666n;
    await chorus.mintToken(tokensMinted * precision, acc1.address)
    expect(tokensMinted).to.equal(BigInt(await chorus.totalSupply()) / precision)
    await expect(chorus.mintToken(1n * precision, acc1.address)).to.be.reverted
    // Ensure the transaction didn't change the total supply
    expect(tokensMinted).to.equal(BigInt(await chorus.totalSupply()) / precision)
  });

  it("Withdraw collateral", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision)
    expect(await collateral.balanceOf(owner.address)).to.equal(0);
    expect(await collateral.balanceOf(chorus.address)).to.equal(collateralDeposit * precision);
    let tokensMinted = 600n;
    await chorus.mintToken(tokensMinted * precision, acc1.address)
    let expWithdrawAmnt = 1n * precision;
    await chorus.withdrawCollateral(expWithdrawAmnt)
    expect(await collateral.balanceOf(owner.address)).to.equal(expWithdrawAmnt);
    await expect(chorus.withdrawCollateral(1n * precision), "collateral withdraw puts the system below the threshold").to.be.reverted
    expect(await collateral.balanceOf(owner.address)).to.equal(expWithdrawAmnt);
  })

  it("Liquidation", async function () {
    // Put the system into 40% collateral utilization.
    let collateralDeposit = 10.0
    await chorus.depositCollateral(BigInt(collateralDeposit) * precision)
    let tokensTotalSupply = 400
    let acc1TknPercentSupply = 0.4 // 40% ot the total supply.
    let acc2TknPercentSupply = 0.6 // 60% ot the total supply.
    await chorus.mintToken(BigInt(tokensTotalSupply * acc1TknPercentSupply) * precision, acc1.address)
    await chorus.mintToken(BigInt(tokensTotalSupply * acc2TknPercentSupply) * precision, acc2.address)
    // Reduce the collateral price by 50% to put the system into liquation state.
    // Rewind the machine because oracle price needs to be at least collateralPriceAge old.
    await oracle.submitValue(1, (collateralPrice / 4) * collateralPriceGranularity)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    // The account should receive the collateral liquidation amount
    // equal to its total supply percent in tokens.
    let account = acc1
    expect(await collateral.balanceOf(account.address)).to.equal(0)
    await chorus.connect(account).liquidate();
    expect(await collateral.balanceOf(account.address)).to.equal(BigInt(collateralDeposit * acc1TknPercentSupply * Number(precision)));
    expect(await chorus.balanceOf(account.address)).to.equal(0);
    expect(await chorus.collateralBalance()).to.equal(BigInt(collateralDeposit * (1 - acc1TknPercentSupply) * Number(precision)));
    await expect(chorus.connect(account).liquidate()).to.be.reverted
    // Set liquidation penaly and test that collateral penalty is transfered to the benificiary address.
    let liquidationPenatly = 0.15 // 15%
    chorus.setLiquidationPenatly(BigInt(liquidationPenatly * 100) * precision)
    // The account should receive the collateral liquidation amount 
    // equal to its total supply percent in tokens minus the liquidation penalty.
    account = acc2
    expect(await collateral.balanceOf(account.address)).to.equal(0);
    expect(await collateral.balanceOf(benificiary.address)).to.equal(0);
    await chorus.connect(account).liquidate();
    let expAccountCollat = collateralDeposit * (acc2TknPercentSupply - (acc2TknPercentSupply * liquidationPenatly)) * Number(precision)
    expect(await collateral.balanceOf(account.address)).to.equal(BigInt(expAccountCollat));
    expect(await chorus.balanceOf(account.address)).to.equal(0);
    expect(await chorus.collateralBalance()).to.equal(0);
    // Benificiary address should receive the penalty.
    let expBenificiaryCollat = (collateralDeposit * acc2TknPercentSupply * liquidationPenatly).toFixed(2) * Number(precision)
    expect(await collateral.balanceOf(benificiary.address)).to.equal(BigInt(expBenificiaryCollat));
    await expect(chorus.connect(account).liquidate()).to.be.reverted
  })

  it("Tokens Withdraw", async function () {
    let collateralDeposit = 10n
    let mintedTokens = 400n
    let account = acc1
    await chorus.depositCollateral(collateralDeposit * precision)
    await chorus.mintToken(mintedTokens * precision, account.address)
    let withdrawCount = 50n
    let expCollateralWithdrawn = 0
    for (; mintedTokens > 0;) {
      mintedTokens -= withdrawCount
      evmCurrentBlockTime += 60;
      await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
      await waffle.provider.send("evm_mine");
      let collatPrice = Number(BigInt(collateralPrice) * precision)
      await chorus.connect(account).requestWithdrawToken(withdrawCount * precision);
      let ts = await chorus.totalSupply()
      _waitPeriod = 1 + 100* Number(withdrawCount * precision) / Number(ts) / 5
      evmCurrentBlockTime += 86400 * Math.floor(_waitPeriod) + 10;
      await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
      let secsPassed = evmCurrentBlockTime - Number(await chorus.inflLastUpdate())
      let tknPrice = Number(accrueInflation(tokenPrice, secsPassed))
      await chorus.connect(account).withdrawToken();
      expect(await chorus.balanceOf(account.address)).to.equal((mintedTokens) * precision);
      let priceRatio = tknPrice / collatPrice
      expCollateralWithdrawn += Number(priceRatio * Number(withdrawCount * precision))
      let actCollateralWithdrawn = Number(await collateral.balanceOf(account.address))
      // There is a rounding error so ignore the difference after the rounding error.
      // The total precision is enough that this rounding shouldn't matter.
      expect(actCollateralWithdrawn).to.be.closeTo(expCollateralWithdrawn, 700000000000)
      expect(Number(await chorus.collateralBalance())).to.be.closeTo(Number(collateralDeposit * precision - BigInt(expCollateralWithdrawn)), 70000000000);
    }
    await expect(chorus.withdrawToken(1n), "withdraw tokens when balance should be zero").to.be.reverted
  })

  it("withdrawal after collateral price fluctuation", async function () {
    //declare variables
    let collateralDeposit = 10n
    let mintedTokens = 400n
    let users = [user1, user2]
    //ensure fresh start (each user has zero balance)
    users.forEach(function(user) {
      assert(await chorus.balanceOf(user.address) == 0, "user should not have notes until they deposit collateral")
    })
    //admin deposits collateral in order to mint notes
    await chorus.depositCollateral(collateralDeposit*tokenPrecision)
    //admin mints notes to users
    users.forEach(function(user) {
      await chorus.mintToken(mintedTokens*tokenPrecision, user.address)
      //check that users received balances
      assert(await chorus.balanceOf(user.address) == mintedTokens*tokenPrecision, "user did not receive (or received wrong amount of) notes")
    })
    //read collateralization ratio
    collateralRatio = await chorus.collateralRatio()
    //increase collateral price by 100%
    collateralprice = collateralPrice * 2
    //collateral price fluctuates, miner submits new value
    oracle.submitValue(1, collateralPrice*collateralPriceGranularity)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
    await waffle.provider.send("evm_mine")
    //collateral ratio should double
    assert(await chorus.collateralRatio() == (collateralRatio * 2), "collateralization ratio didn't update on chain")
    //each user withdraws token for their collateral
    users.forEach(function(user) {
      //check balances of token, notes
      assert(await chorus.balanceOf(user.address) == collateralDeposit, "user's notes balance didn't update")
      await collateral.balanceOf(user.address)
      //user requests to withdraw all tokens for their collateral
      chorus.requestWithdrawToken()
      //check balances of token, notes
      //user tries to withdraw immediately and can't
      //check balances of token, notes
      //user waits and withdraws
      //check balances of token, notes
    })


  })

  it("liquidation then withdrawals after collateral price fluctuation", async function () {

  })

  it("mint notes after huge upward price change", async function () {

  })

  it("withdrawal after year's end initiates inflation", async function () {

  })

  it("handles very high and very low collateralization and token supply", async function () {
    
  })

  it("prevent withdrawal, undo withdrawal request after liquidation", async function () {

  })

});