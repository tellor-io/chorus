const { expect, assert } = require("chai")
const { default: Decimal } = require("decimal.js");
const { providers } = require("ethers");

//eth addresses
let owner, acc1, acc2, acc3, acc4, beneficiary; //eth accounts used by tests
let oracle, chorus, collateralTkn; //eth contracts used by tests

//contract constructor arguments
const precision = BigInt(1e18) //erc20 float precision (standard)
const collateralPrice = 100 //price of collateralTkn token
const oraclePricePrecision = 1e6 //precision of oracle's token price data
const secsPerYear = 365*24*60*60
const nominalInflationRateYear = 0.1 // 0.1 = 10%
const effectiveInflationRate = nominalToEffectiveInflation(new Decimal(nominalInflationRateYear))
const inflationRate = new Decimal(effectiveInflationRate).mul(1e18) //effective inflation rate (formatted for solidity)
const inflationRatePerSec = ((inflationRate / 1e10) / (secsPerYear * 10e7))
const notePrice = 1e18

var evmCurrentBlockTime = Math.round((Number(new Date().getTime())) / 1000)


//helper functions

function accrueInflation(principal, secsPassed, inflPerSec = inflationRatePerSec) {
    let rate = 1 + inflPerSec;
    infl = principal / rate ** secsPassed
    return BigInt(infl);
  }
  
  function accrueInterest(principal, secsPassed) {
    let rate = 1 + inflationRatePerSec;
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
        //create ethereum accounts for common Chorus contract roles
        [owner, acc1, acc2, acc3, acc4, beneficiary] = await ethers.getSigners();
        //deploy test Tellor oracle
        let oracleDepl = await deployments.deploy('MockOracle', {
            from: owner.address,
        })
        //connect to test Tellor oracle contract
        let oracle = await ethers.getContract("MockOracle")
        //deploy test ERC20 collateralTkn token contract (arbitrary token)
        let collateralDepl = await deployments.deploy('Token', {
            from: owner.address,
            args: [
                "myToken", //arbitrary name
                "TKN", //arbitrary symbol
                false
            ]
        })
        //connect to test ERC20 collateralTkn token contract
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

        await collateralTkn.mint(owner.address, 50n*precision)
        await collateralTkn.increaseAllowance(chorus.address, BigInt(1e50))
        //return test contracts
        return { oracle, collateralTkn, chorus }
})

function nominalToEffectiveInflation(nominal) {
    let secsPerYearD = new Decimal(secsPerYear)
    let base = new Decimal(1.0).add(nominal.div(secsPerYearD))
    let j = base.pow(secsPerYearD)
    let k = j.sub(new Decimal(1.0))
    return k
  }

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
    let expPrice = Number(accrueInflation(notePrice, secsPassed))
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
    expect(currPrice - (currPrice * nominalInflationRateYear)).to.be.closeTo(actPrice, 200000000000000)
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
    expect(await chorus.balanceOf(beneficiary.address)).to.equal(0) // Start with 0
    let expInflBeneficiaryTokens = Number(accrueInterest(await chorus.totalSupply(), secsPassed))
    await chorus.updateInflation()
    let actInflBeneficiaryTokens = Number(await chorus.balanceOf(beneficiary.address))
    // There is a rounding error so ignore the difference after the rounding error.
    // The total precision is enough that this rounding shouldn't matter.
    expect(actInflBeneficiaryTokens).to.be.closeTo(expInflBeneficiaryTokens, 20000000000000)
  })

  it("collateral deposit and ratio", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision) //deposit 10 *100$ = 1,000
    expect(await collateralTkn.balanceOf(chorus.address)).to.equal(collateralDeposit * precision)
    expect(await chorus.collateralRatio()).to.equal(0)
    let tokensMinted = 499n; //Mint 500 tokens
    await chorus.mintToken(tokensMinted * precision, acc1.address)
    expect(tokensMinted).to.equal(BigInt(await chorus.totalSupply()) / precision)
    let totalTokenValue = Number(tokensMinted) * notePrice
    let collateralValue = collateralDeposit * BigInt(collateralPrice) * precision
    let expcollateralRatio = 100* Number(collateralValue)/totalTokenValue 
    let actcollateralRatio = (Number(await chorus.collateralRatio()) / Number(precision) * 100)
    expect(expcollateralRatio).to.be.closeTo(actcollateralRatio,.001)
  });

  it("Should not allow minting tokens above the collateralTkn threshold", async function () {
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
    expect(await collateralTkn.balanceOf(owner.address)).to.equal(0);
    expect(await collateralTkn.balanceOf(chorus.address)).to.equal(collateralDeposit * precision);
    let tokensMinted = 600n;
    await chorus.mintToken(tokensMinted * precision, acc1.address)
    let expWithdrawAmnt = 1n * precision;
    await chorus.withdrawCollateral(expWithdrawAmnt)
    expect(await collateralTkn.balanceOf(owner.address)).to.equal(expWithdrawAmnt);
    await expect(chorus.withdrawCollateral(1n * precision), "collateral withdraw puts the system below the threshold").to.be.reverted
    expect(await collateralTkn.balanceOf(owner.address)).to.equal(expWithdrawAmnt);
  })

  it("Liquidation", async function () {
    // Put the system into 40% collateralTkn utilization.
    let collateralDeposit = 10.0
    await chorus.depositCollateral(BigInt(collateralDeposit) * precision)
    let tokensTotalSupply = 400
    let acc1TknPercentSupply = 0.4 // 40% ot the total supply.
    let acc2TknPercentSupply = 0.6 // 60% ot the total supply.
    await chorus.mintToken(BigInt(tokensTotalSupply * acc1TknPercentSupply) * precision, acc1.address)
    await chorus.mintToken(BigInt(tokensTotalSupply * acc2TknPercentSupply) * precision, acc2.address)
    // Reduce the collateralTkn price by 50% to put the system into liquation state.
    // Rewind the machine because oracle price needs to be at least collateralPriceAge old.
    await oracle.submitValue(1, (collateralPrice / 4) * oraclePricePrecision)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    // The account should receive the collateralTkn liquidation amount
    // equal to its total supply percent in tokens.
    let account = acc1
    expect(await collateralTkn.balanceOf(account.address)).to.equal(0)
    await chorus.connect(account).liquidate();
    expect(await collateralTkn.balanceOf(account.address)).to.equal(BigInt(collateralDeposit * acc1TknPercentSupply * Number(precision)));
    expect(await chorus.balanceOf(account.address)).to.equal(0);
    expect(await chorus.collateralBalance()).to.equal(BigInt(collateralDeposit * (1 - acc1TknPercentSupply) * Number(precision)));
    await expect(chorus.connect(account).liquidate()).to.be.reverted
    // Set liquidation penalty and test that collateralTkn penalty is transfered to the beneficiary address.
    let liquidationPenatly = 0.15 // 15%
    chorus.setLiquidationPenalty(BigInt(liquidationPenatly * 100) * precision)
    // The account should receive the collateralTkn liquidation amount 
    // equal to its total supply percent in tokens minus the liquidation penalty.
    account = acc2
    expect(await collateralTkn.balanceOf(account.address)).to.equal(0);
    expect(await collateralTkn.balanceOf(beneficiary.address)).to.equal(0);
    await chorus.connect(account).liquidate();
    let expAccountCollat = collateralDeposit * (acc2TknPercentSupply - (acc2TknPercentSupply * liquidationPenatly)) * Number(precision)
    expect(await collateralTkn.balanceOf(account.address)).to.equal(BigInt(expAccountCollat));
    expect(await chorus.balanceOf(account.address)).to.equal(0);
    expect(await chorus.collateralBalance()).to.equal(0);
    // beneficiary address should receive the penalty.
    let expbeneficiaryCollat = (collateralDeposit * acc2TknPercentSupply * liquidationPenatly).toFixed(2) * Number(precision)
    expect(await collateralTkn.balanceOf(beneficiary.address)).to.equal(BigInt(expbeneficiaryCollat));
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
      let tknPrice = Number(accrueInflation(notePrice, secsPassed))
      await chorus.connect(account).withdrawToken();
      expect(await chorus.balanceOf(account.address)).to.equal((mintedTokens) * precision);
      let priceRatio = tknPrice / collatPrice
      expCollateralWithdrawn += Number(priceRatio * Number(withdrawCount * precision))
      let actCollateralWithdrawn = Number(await collateralTkn.balanceOf(account.address))
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
    assert(await chorus.balanceOf(acc1.address) == 0, "user should not have notes yet")
    //admin deposits collateral in order to mint notes
    await chorus.depositCollateral(collateralDeposit*precision)
    //admin mints notes to users
    await chorus.mintToken(mintedTokens*precision, acc1.address)
    assert(await chorus.balanceOf(acc1.address) == mintedTokens*precision, "user did not receive (or received wrong amount of) notes")
    //read collateralization ratio
    collateralRatio = await chorus.collateralRatio()
    //collateral price fluctuates, miner submits new value
    oracle.submitValue(1, 200*oraclePricePrecision)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
    await waffle.provider.send("evm_mine")
    //collateral ratio should double
    expect(Number(await chorus.collateralRatio()))
           .to.be.closeTo(Number(collateralRatio) * 2, .001,
           "collateralization ratio didn't update on chain")
    //each user withdraws token for their collateral
    //check balances of notes
    assert(await chorus.balanceOf(acc1.address) == (mintedTokens * precision),
           "user's notes balance didn't update")
    //check for undercollateralization
    //user requests to withdraw all tokens for their collateral
    await chorus.connect(acc1).requestWithdrawToken(mintedTokens * precision)
    //check balances of notes, they should have transferred their tokens to the contract
    expect(await chorus.balanceOf(acc1.address)).to.equal(0, 
          "user still has notes after withdrawal request")
    //user tries to withdraw immediately and can't
    expect(chorus.connect(acc1).withdrawToken(), "user was able to withdraw collateral without waiting").to.be.reverted
    //check balance of user's collateral, they shouldn't have any collateral yet
    assert(await collateralTkn.balanceOf(acc1.address) == 0)
    //user waits one day
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 86400 * 22// 22 days to withdraw all tokens
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]) 
    await waffle.provider.send("evm_mine")
    //user withdraws successfully
    await chorus.connect(acc1).withdrawToken()
    //check balances of colllatreal
    expect(Number(await collateralTkn.balanceOf(acc1.address)))
    .to.be.closeTo(Number(await chorus.tokenPrice())
              / Number(await chorus.collateralPrice())
              * Number(mintedTokens * precision),
              0.01*1e+18,
              "User could not claim collateral after withdrawal as expected")


  })

  it("liquidation then withdrawals after collateral price fluctuation", async function () {
    //declare variables
    let collateralDeposit = 10n
    let mintedTokens = 400n
    //ensure fresh start (each user has zero balance)
    assert(await chorus.balanceOf(acc1.address) == 0, "user should not have notes yet")
    //admin deposits collateral in order to mint notes
    await chorus.depositCollateral(collateralDeposit*precision)
    //admin mints notes to users
    await chorus.mintToken(mintedTokens*precision, acc1.address)
    //check that users received balances
    assert(await chorus.balanceOf(acc1.address) == mintedTokens*precision, "user did not receive (or received wrong amount of) notes")
    //read collateralization ratio
    collateralRatio = await chorus.collateralRatio()
    //decrese collateral price by two-thirds
    // newCollateralprice = 33
    //collateral price fluctuates, miner submits new value
    await oracle.submitValue(1, 33*oraclePricePrecision)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
    await waffle.provider.send("evm_mine")
    //collateral ratio should decrease by two-thirds
    expect(Number(await chorus.collateralRatio()) / Number(precision))
           .to.be.closeTo(Number(collateralRatio) * 0.33 / Number(precision), .001,
           "collateralization ratio didn't update on chain")
    //one user initiates liquidation
    expect(await chorus.connect(acc1).liquidate(), "user couldn't liquidate undercollateralized system").to.emit(chorus, 'Liquidate')
  })

  it("mint notes after huge upward price change", async function () {
    //declare variables
    let collateralDeposit = 10n
    let mintedTokens = 400n
    //ensure fresh start (each user has zero balance)
    assert(await chorus.balanceOf(acc1.address) == 0, "user should not have notes yet")
    //admin deposits collateral in order to mint notes
    await chorus.depositCollateral(collateralDeposit*precision)
    //admin mints notes to users
    await chorus.mintToken(mintedTokens*precision, acc1.address)
    //check that users received balances
    assert(await chorus.balanceOf(acc1.address) == mintedTokens*precision, "user did not receive (or received wrong amount of) notes")
    //read collateralization ratio
    collateralRatio = await chorus.collateralRatio()
    //collateral price fluctuates, miner submits new value
    await oracle.submitValue(1, 300*oraclePricePrecision)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
    await waffle.provider.send("evm_mine")
    //collateral ratio should triple
    expect(Number(await chorus.collateralRatio()))
           .to.be.closeTo(Number(collateralRatio) * 3, .001,
           "collateralization ratio didn't update on chain")
    initialBalance = BigInt(await chorus.balanceOf(acc1.address))
    await chorus.mintToken(mintedTokens*precision, acc1.address)
    //double check note balances have updated
    expect(await chorus.balanceOf(acc1.address))
    .to.equal(initialBalance + mintedTokens*precision,
           "user was not minted (or minted wrong amount of) notes")
  })

  it("withdrawal after inflation", async function () {
    //declare variables
    let collateralDeposit = 30n
    let mintedTokens = 400n
    //ensure fresh start (each user has zero balance)
    assert(await chorus.balanceOf(acc1.address) == 0, "user should not have notes yet")
    //admin deposits collateral in order to mint notes
    await chorus.depositCollateral(collateralDeposit*precision)
    //admin mints notes to users
    await chorus.mintToken(mintedTokens*precision, acc1.address)
    await chorus.mintToken(mintedTokens*precision, acc2.address)
    await chorus.mintToken(mintedTokens*precision, acc3.address)
    //check that users received balances
    assert(await chorus.balanceOf(acc1.address) == mintedTokens*precision,
           "user did not receive (or received wrong amount of) notes")
    //read total supply
    // expect(await chorus.totalSupply())
    // .to.be.closeTo(
    //   Number(await chorus.balanceOf(acc1.address))
    //   + Number(await chorus.balanceOf(acc2.address))
    //   + Number(await chorus.balanceOf(acc3.address)),
    //   + Number(await chorus.balanceOf(beneficiary.address)),
    //   0.01,
    //   "total supply doesn't equal total of balances"
    // )
    //read beneficiary balance
    expect(await chorus.balanceOf(beneficiary.address)).to.equal(0,
      "beneficiary has notes before inflation is updated")
 

    //fast forward 1 week, pay beneficiary (update inflation), read total supply, read collateral ratio
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 604800 //1 week
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
    await waffle.provider.send("evm_mine")
    
    let oldTotalSupply = await chorus.totalSupply()
    await chorus.updateInflation()
    expect(Number(await chorus.totalSupply()) / Number(precision))
      .to.be.closeTo((Number(oldTotalSupply) + Number(await chorus.balanceOf(beneficiary.address))) / Number(precision),
      0.1,
      "total supply does not match pre-inflation supply + inflation beneficiary balance"
      )
    await chorus.connect(acc1).requestWithdrawToken(mintedTokens*precision)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 86400 * 8 // 8 days to withdraw 1/3 supply
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]) 
    await waffle.provider.send("evm_mine")
    await chorus.updateInflation()
    await chorus.connect(acc1).withdrawToken()
    expect(Number(await chorus.totalSupply()) / Number(precision))
      .to.be.closeTo(Number(oldTotalSupply) /Number(precision) - Number(mintedTokens),
      Number(await chorus.balanceOf(beneficiary.address)),
      "total supply did not decrease by user's note balance")

    //fast forward 3 months
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 7.884e+6 //3 months
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
    await waffle.provider.send("evm_mine")

    oldTotalSupply = await chorus.totalSupply()
    await chorus.updateInflation()
    expect(Number(await chorus.totalSupply()) / Number(precision))
      .to.be.closeTo((Number(oldTotalSupply) + Number(await chorus.balanceOf(beneficiary.address))) / Number(precision),
      0.1,
      "total supply does not match pre-inflation supply + inflation beneficiary balance"
      )
    await chorus.connect(acc2).requestWithdrawToken(mintedTokens*precision)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 86400 * 8 // 12 days to withdraw 1/2 supply
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]) 
    await waffle.provider.send("evm_mine")
    await chorus.updateInflation()
    await chorus.connect(acc2).withdrawToken()
    expect(Number(await chorus.totalSupply()) / Number(precision))
      .to.be.closeTo(Number(oldTotalSupply) /Number(precision) - Number(mintedTokens),
      Number(await chorus.balanceOf(beneficiary.address)),
      "total supply did not decrease by user's note balance")



    //fast forward 1 year
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 3.154e+7 //1 year
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
    await waffle.provider.send("evm_mine")


  })

  it("handles very high and very low collateralization and token supply", async function () {
      //declare variables
      let collateralDeposit = 30n
      let mintedTokens = 400n
      //ensure fresh start (each user has zero balance)
      assert(await chorus.balanceOf(acc1.address) == 0, "user should not have notes yet")
      //admin deposits collateral in order to mint notes
      await chorus.depositCollateral(collateralDeposit*precision)
      //admin mints notes to users
      await chorus.mintToken(mintedTokens*precision, acc1.address)

      //decrease collateral price
      await oracle.submitValue(1, collateralPrice/1000 * oraclePricePrecision)
      evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 500
      await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
      await waffle.provider.send("evm_mine")

      //system liquidates
      await chorus.connect(acc1).liquidate()

      //
  })

  it("prevent withdrawal, undo withdrawal request after liquidation", async function () {

    

  })

});