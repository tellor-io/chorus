require("dotenv").config();

const func = async function (hre) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();

    let oracleAddress =  "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0";
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
        await oracle.submitValue(process.env.COLLATERAL_ID, 2 * process.env.COLLATERAL_GRANULARITY)

        console.log("MockOracle deployed to:", oracleAddress);
    }

    console.log(process.env.DETERMINISTIC_DEPLOYMENT)

    const contract = await deploy('Chorus', {
        from: deployer,
        log: true,
        deterministicDeployment: (process.env.DETERMINISTIC_DEPLOYMENT == "true") ? true : false,
        args: [
            oracleAddress,
            process.env.COLLATERAL_ADDRESS,
            process.env.COLLATERAL_ID,
            process.env.COLLATERAL_GRANULARITY,
            process.env.NOTE_NAME,
            process.env.NOTE_SYMBOL,
            process.env.INFL_RATE_PER_YEAR,
            process.env.BENIFICIARY_ADDRESS,
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