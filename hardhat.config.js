require("@nomiclabs/hardhat-waffle");
require("dotenv").config();
require("hardhat-gas-reporter");
require('hardhat-log-remover');
require('hardhat-deploy');
require("hardhat-deploy-ethers");

task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();
  for (const account of accounts) {
    console.log(account.address);
  }
});

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  gasReporter: {
    enabled: (process.env.REPORT_GAS == "true") ? true : false
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
    },
    // localhost: {
    //   url: `${process.env.NODE_TEST}`,
    //   accounts: [process.env.PRIVATE_KEY],
    //   explorer: "http://rinkeby.etherscan.io/address/"
    // },
    // test: {
    //   url: `${process.env.NODE_TEST}`,
    //   accounts: [process.env.PRIVATE_KEY],
    //   explorer: "http://rinkeby.etherscan.io/address/",
    // },
    // main: {
    //   url: `${process.env.NODE_MAIN}`,
    //   accounts: [process.env.PRIVATE_KEY]
    // },
    // maticTest: {
    //   url: "https://rpc-mumbai.maticvigil.com",
    //   accounts: [process.env.PRIVATE_KEY]
    // },
    // maticMain: {
    //   url: "https://rpc-mainnet.maticvigil.com",
    //   accounts: [process.env.PRIVATE_KEY]
    // },
    // bscTest: {
    //   url: "https://data-seed-prebsc-1-s1.binance.org:8545",
    //   chainId: 97,
    //   gasPrice: 20000000000,
    //   accounts: [process.env.PRIVATE_KEY],
    //   explorer: "https://testnet.bscscan.com/address/"
    // },
    // bscMain: {
    //   url: "https://bsc-dataseed1.binance.org:443",
    //   chainId: 56,
    //   gasPrice: 20000000000,
    //   accounts: [process.env.PRIVATE_KEY]
    // }
  },
  namedAccounts: {
    deployer: 0,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.3"
      }
    ]
  },
  mocha: {
    timeout: 600000 // 10mins test timeout.
  }
};