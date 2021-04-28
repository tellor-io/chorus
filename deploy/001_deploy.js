require("dotenv").config();
const { default: Decimal } = require("decimal.js");

const COLLATERAL_ADDRESS="0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0" //an erc20 token address to act as collateral
const COLLATERAL_ID=50 //the Tellor ID (for pulling data) of the collateral token
const COLLATERAL_GRANULARITY=1000000 //the granularity of the collateral (1e6 for most Tellor prices)
const NOTE_NAME="My Anthem"//the token name of the note
const NOTE_SYMBOL="MA"//symbol of the note
const INFL_RATE_PER_YEAR=.1//10%
const BENIFICIARY_ADDRESS="0x0d7EFfEFdB084DfEB1621348c8C70cc4e871Eba4"//a contract that gets the inflation in the system
const DETERMINISTIC_DEPLOYMENT=true
const IS_WHITELISTED_TOKEN = false
let oracleAddress =  "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0";//Tellor address
const effRate = nominalToEffectiveInflation(new Decimal(INFL_RATE_PER_YEAR))
const inflRate = new Decimal(effRate).mul(1e18)

function nominalToEffectiveInflation(nominal) {
    let secsPerYearD = new Decimal(365 * 24 * 60 * 60)
    let base = new Decimal(1.0).add(nominal.div(secsPerYearD))
    let j = base.pow(secsPerYearD)
    let k = j.sub(new Decimal(1.0))
    return k
  }

const func = async function (hre) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    if (
        hre.hardhatArguments.network == "main" ||
        hre.hardhatArguments.network == "maticMain" ||
        hre.hardhatArguments.network == "bscMain"
    ) {
        await run("remove-logs");
        deployer = process.env.PRIVATE_KEY
    }

    if (hre.hardhatArguments.network == "localhost") {
        // Deploy MockOracle
        let oracleDepl = await deploy('MockOracle', {
            from: deployer,
        })
        let oracle = await ethers.getContract("MockOracle");
        oracleAddress = oracleDepl.address;
        await oracle.submitValue(COLLATERAL_ID, 2 * COLLATERAL_GRANULARITY)

        console.log("MockOracle deployed to:", oracleAddress);
    }

    console.log(DETERMINISTIC_DEPLOYMENT)

    const contract = await deploy('Chorus', {
        from: deployer,
        log: true,
        deterministicDeployment: (DETERMINISTIC_DEPLOYMENT == "true") ? true : false,
        args: [
            oracleAddress,
            COLLATERAL_ADDRESS,
            COLLATERAL_ID,
            COLLATERAL_GRANULARITY,
            NOTE_NAME,
            NOTE_SYMBOL,
            BigInt(Math.floor(inflRate)).toString(),
            BENIFICIARY_ADDRESS,
            IS_WHITELISTED_TOKEN
        ],
    });
    let chorus = await ethers.getContract("Chorus");

    if (hre.hardhatArguments.network == "localhost") {
        // Set new block timestamp and mine
        let evmCurrentBlockTime = (await hre.waffle.provider.getBlock()).timestamp + Number(await chorus.collateralPriceAge()) + 100
        await hre.waffle.provider.send("evm_mine", [evmCurrentBlockTime]);
    }

    console.log("contract deployed to:", hre.network.config.explorer + contract.address);
};

module.exports = func;
func.tags = ['Chorus'];