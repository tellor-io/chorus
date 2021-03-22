require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
require('hardhat-dependency-compiler');
require("hardhat-gas-reporter");
require('hardhat-log-remover');

task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("deploy", "Deploy and verify the contracts")
  .addParam("tellorAddress", "The Tellor oracle address")
  .addParam("collateralAddress", "The collateral token contract address")
  .addParam("collateralId", "The collateral token id in the tellor oracle")
  .addParam("collateralGranularity", "The collateral token granularity in the tellor oracle")
  .addParam("collateralName", "The collateral name")
  .addParam("collateralSymbol", "The collateral Symbol")
  .addParam("tokenName", "The token name")
  .addParam("tokenSymbol", "The token Symbol")
  .addParam("inflRatePerYear", "The compound inflation rate per year")
  .addParam("benificiaryAddress", "The benificiary address")
  .setAction(async taskArgs => {
    await run("compile");

    if (taskArgs.network == "mainnet") {
      await run("remove-logs");
    }

    const t = await ethers.getContractFactory("Main");
    const contract = await t.deploy(
      taskArgs.tellorAddress,
      taskArgs.collateralAddress,
      taskArgs.collateralId,
      taskArgs.collateralGranularity,
      taskArgs.collateralName,
      taskArgs.collateralSymbol,
      taskArgs.tokenName,
      taskArgs.tokenSymbol,
      taskArgs.inflRatePerYear,
      taskArgs.benificiaryAddress
    );
    await contract.deployed();
    console.log("contract deployed to:", "https://" + taskArgs.network + ".etherscan.io/address/" + contract.address);
    console.log("    transaction hash:", "https://" + taskArgs.network + ".etherscan.io/tx/" + contract.deployTransaction.hash);

    // Wait for few confirmed transactions.
    // Otherwise the etherscan api doesn't find the deployed contract.
    console.log('waiting for tx confirmation...');
    await contract.deployTransaction.wait(3)

    console.log('submitting for etherscan verification...');
    await run(
      "verify:verify", {
      address: contract.address,
      constructorArguments: [
        taskArgs.tellorAddress,
        taskArgs.collateralAddress,
        taskArgs.collateralId,
        taskArgs.collateralGranularity,
        taskArgs.collateralName,
        taskArgs.collateralSymbol,
        taskArgs.tokenName,
        taskArgs.tokenSymbol,
        taskArgs.inflRatePerYear,
        taskArgs.benificiaryAddress,
      ],
    },
    )
  });

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  dependencyCompiler: {
    paths: [
      'tellorplayground/contracts/TellorPlayground.sol',
    ],
    keep: true,
  },
  gasReporter: {
    enabled: (process.env.REPORT_GAS == "true") ? true : false
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
    },
    // rinkeby: {
    //   url: `https://rinkeby.infura.io/v3/${process.env.INFURA_RINKEBY}`,
    //   accounts: [process.env.PRIVATE_KEY]
    // },
    // mainnet: {
    //   url: `https://mainnet.infura.io/v3/${process.env.INFURA_MAINNET}`,
    //   accounts: [process.env.PRIVATE_KEY]
    // }
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN
  },
  solidity: {
    compilers: [
      {
        version: "0.7.3"
      },
      {
        version: "0.7.0",
      }
    ]
  },
  mocha: {
    timeout: 600000 // 10mins test timeout.
  }
};

