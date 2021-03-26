require("dotenv").config();

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
    }

    const contract = await deploy('Main', {
        from: deployer,
        log: true,
        deterministicDeployment: true,
        args: [
            process.env.ORACLE_ADDRESS,
            process.env.COLLATERAL_ADDRESS,
            process.env.COLLATERAL_ID,
            process.env.COLLATERAL_GRANULARITY,
            process.env.COLLATERAL_NAME,
            process.env.COLLATERAL_SYMBOL,
            process.env.TOKEN_NAME,
            process.env.TOKEN_SYMBOL,
            process.env.INFL_RATE_PER_YEAR,
            process.env.BENIFICIARY_ADDRESS,
        ],
    });

    console.log("contract deployed to:", hre.network.config.explorer + contract.address);
};

module.exports = func;
func.tags = ['Main'];