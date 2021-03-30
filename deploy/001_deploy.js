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
        deployer = process.env.PRIVATE_KEY
    }

    const contract = await deploy('Chorus', {
        from: deployer,
        log: true,
        deterministicDeployment: true,
        args: [
            "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0", // The oracle address.
            process.env.COLLATERAL_ADDRESS,
            process.env.COLLATERAL_ID,
            process.env.COLLATERAL_GRANULARITY,
            process.env.COLLATERAL_NAME,
            process.env.COLLATERAL_SYMBOL,
            process.env.INFL_RATE_PER_YEAR,
            process.env.BENIFICIARY_ADDRESS,
        ],
    });

    console.log("contract deployed to:", hre.network.config.explorer + contract.address);
};

module.exports = func;
func.tags = ['Chorus'];