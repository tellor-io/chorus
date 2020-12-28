require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
require('hardhat-dependency-compiler');
require("hardhat-gas-reporter");


task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("deploy", "Deploy and verify the contracts")
  .setAction(async taskArgs => {
    var masterAddress = taskArgs.masterAddress
    await run("compile");

    const t = await ethers.getContractFactory("Main");
    const contract = await t.deploy();
    await contract.deployed();
    console.log("contract deployed to:", contract.address);
    console.log("    transaction hash:", contract.deployTransaction.hash);

    // Wait for few confirmed transactions.
    // Otherwise the etherscan api doesn't find the deployed contract.
    console.log('waiting for tx confirmation...');
    await contract.deployTransaction.wait(3)

    console.log('submitting for etherscan verification...');
    await run(
      "verify", {
      address: contract.address,
      constructorArguments: [masterAddress],
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
  },
  gasReporter: {
    enabled: (process.env.REPORT_GAS == "true") ? true : false
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_RINKEBY}`,
      accounts: [process.env.PRIVATE_KEY]
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_MAINNET}`,
      accounts: [process.env.PRIVATE_KEY]
    }
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

