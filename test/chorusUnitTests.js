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
        evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
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

describe("Chorus Unit Tests", function () {

  it("deposit collateral", async function () {

    //onlyAdmin: users shouldn't be able to deposit collateral
    await collateralTkn.mint(acc1.address, 10n*precision)
    let accColatteralBalance = await collateralTkn.balanceOf(acc1.address)
    expect(chorus.connect(acc1).depositCollateral(accColatteralBalance),
      "non-admin deposited collateral").to.be.reverted
    //require 1: owner must deposit non-zero amount of collateral 
    expect(chorus.connect(owner).depositCollateral(0),
      "owner deposited 0 collateral").to.be.reverted
    //require 2: owner must have sufficient collateral for deposit
    let ownerCollateralBalance = await collateralTkn.balanceOf(owner.address)
    expect(chorus.connect(owner).depositCollateral(ownerCollateralBalance + 1n),
      "owner deposited more collateral than their collateral balance").to.be.reverted


  })

  it("liquidate / set liquidation penalty", async function () {

    //setup: deposit collateral and mint token to user, user withdraws for collateral
    let liquidationPenalty = 0.2
    chorus.connect(owner).setLiquidationPenalty(BigInt(liquidationPenalty * 100) * precision)
    await chorus.connect(owner).depositCollateral(20n*precision)
    await chorus.connect(owner).mintToken(10n*precision, acc1.address)
    await chorus.connect(owner).mintToken(10n*precision, acc3.address)
    await chorus.connect(acc1).requestWithdrawToken(10n*precision)
    await chorus.connect(acc3).requestWithdrawToken(10n*precision)

    let notesToBurn = Number(await chorus.balanceOf(acc1.address))
    let oldCollatBalance = Number(await collateralTkn.balanceOf(acc1.address))
    let oldBeneficiaryCollatBalance = Number(await collateralTkn.balanceOf(beneficiary.address))
    let totalSupply = Number(await chorus.totalSupply())
    let tokenSupplyRatio = Number(await collateralTkn.balanceOf(chorus.address)) / totalSupply
    let collatAmount = notesToBurn*tokenSupplyRatio
    let collatPenalty = collatAmount*Number(await chorus.liquidationPenalty())

    //require 1: no liquidation unless undercollateralized
    expect(chorus.connect(acc1).liquidate(),
      "user could liquidate over-collateralized system").to.be.reverted

    //tank collateral price
    await oracle.submitValue(1, (collateralPrice / 1000) * oraclePricePrecision)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
    await waffle.provider.send("evm_mine")

    //require 2: user must have a balance of notes or have notes locked in chorus contract
    expect(
      chorus.connect(acc2).liquidate(),
      "user liquidated without holding notes"
    ).to.be.reverted
    
    //require 2: user should be able to liquidate between withdrawal request and withdrawal
    await chorus.connect(acc1).liquidate()
    expect(await chorus.balanceOf(acc1.address)).to.equal(
      0,
      "user still has notes after liquidation"
    )

    //require 3: should transfer collateral (minus liquidation penalty) back to user
    expect(Number(await collateralTkn.balanceOf(acc1.address))).to.equal(
      oldCollatBalance + collatAmount - collatPenalty,
      "liquidation transferred the wrong amount of collateral to the user"
    )
    
    //require 4: should transfer liquidation penalty to inflation beneficiary
    expect(Number(await collateralTkn.balanceOf(beneficiary.address))).to.equal(
      oldBeneficiaryCollatBalance + collatPenalty,
      "liquidation transferred the wrong amount of collateral penalty to the inflation beneficiary"
    )

  })

  it("mint token", async function () {
    //setup
    await chorus.connect(owner).depositCollateral(20n*precision)

    //require 1: shouldn't undercollateralize through minting
    expect(
      chorus.connect(owner).mintToken(100000n*precision),
      "owner undercollateralized system with minting"
    ).to.be.reverted

    await chorus.connect(owner).mintToken(10n*precision, acc1.address)

    expect(await chorus.balanceOf(acc1.address)).to.equal(
      10n*precision,
      "user was minted wrong number of notes"
    )


  })

  it("request to withdraw token", async function () {
    //setup
    await chorus.connect(owner).depositCollateral(20n*precision)
    await chorus.connect(owner).mintToken(10n*precision, acc1.address)

    //require 1: withdraw amount should be greater than 0
    expect(
      chorus.connect(acc1).requestWithdrawToken(0),
      "user was able to request withdrawal of 0 notes"
    ).to.be.reverted

    //require 2: withdraw amount show be less than or equal to curent user balance
    expect(
      chorus.connect(acc1).requestWithdrawToken(11n*precision),
      "user was able to request withdrawal of more than their notes balance"
    ).to.be.reverted

    //user requests to withdraw a legal balance
    await chorus.connect(acc1).requestWithdrawToken(3n*precision)
    expect(await chorus.balanceOf(acc1.address)).to.equal(
      7n*precision,
      "user has wrong balance of notes after withdrawal request"
    )

  })
  
  it("set admin", async function () {

    //require 1: can't set owner to 0 address
    expect(
      chorus.connect(owner).setAdmin(0),
      "admin was able to change admin address to 0 address"
    ).to.be.reverted

  })

  it("set collateral threshold", async function () {

    //modifier: collateral ratio should be between 0% and 10,000%
    expect(
      chorus.connect(owner).setCollateralThreshold(101e18),
      "admin was able to set collateral threshold above limit of 10,000%"
    ).to.be.reverted

  })

  it("set liquidation penalty", async function () {

    //modifier: liqudation penalty can't be greater than 100%
    expect(
      chorus.connect(owner).setLiquidationPenalty(101e18),
      "admisn was able to set liquidation penalty greater than 100%"
    ).to.be.reverted

  })

  it("update inflation", async function () {

  })

  it("withdraw collateral", async function () {

  })

  it("withdraw token", async function () {

  })
})
