const { expect, assert } = require("chai")
const { default: Decimal } = require("decimal.js");
const { providers } = require("ethers");

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
        await collateralTkn.mint(owner.address, 10n*tokenPrecision)
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