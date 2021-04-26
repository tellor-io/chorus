const { expect } = require("chai")
const { default: Decimal } = require("decimal.js");
const { providers } = require("ethers");


let owner, acc1, acc2, acc3, acc4, beneficiary; //eth accounts used by tests
let oracle, chorus, collateralTkn; //eth contracts used by tests


//contract float precision
const precision = BigInt(1e18)

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

}

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
            from: ownder.address,
            //Chorus constructor arguments, see contracts/Chorus.sol
            args: [
                oracleDepl.address,
                collateralDepl.address,
                1, 
                collateralPriceGranularity,
                "Anthem", //anthem name (arbitrary)
                "ANT", //anthem symbol (arbitrary)
                BigInt(Math.floor(inflRate)).toString(),
                beneficiary.address,
                false
            ]
        })
        //connect to test Chorus Anthem contract
        let chorus = await ethers.getContract("Chorus")
        //Prepare the inital state of the contracts
        //Add price and rewind the evm
        //as the evm uses a price at least collateralPriceAge old (the Tellor feed delay)
        await oracle.submitValue(1, collateralPrice * collateralPriceGranularity)
        evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
        await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime])
        await waffle.provider.send("evm_mine")
        await collateral.mint(owner.address, 10n*precision)
        await collateral.increaseAllowance(chorus.address, BigInt(1e50))
        return { oracle, collateralTkn, chorus}






