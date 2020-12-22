const { expect } = require("chai");
const { fips } = require("crypto");
const path = require("path")

let owner, acc1, acc2, acc3, acc4, acc5;

let testee;
let tellor;

const precision = BigInt(1e18);
const collateralID = 1;
const collateralPriceGranularity = 1e6;
const collateralPrice = 100 * collateralPriceGranularity;
const collateralName = "Etherium";
const collateralSymbol = "ETH";
const tokenName = "Note";
const tokenSymbol = "NTO";

const inflRate = 5e17; // 50% compound inflation per year.

let secsPerYear = 365 * 86400 * 10e7
var inflRatePerSec = ((inflRate / 1e10) / secsPerYear)

var evmCurrentBlockTime;

describe("All tests", function () {
  it("Collateral utilization", async function () {
    // No minted tokens.
    let collateralDeposit = 1000n;
    await testee.depositCollateral(collateralDeposit * precision)
    expect(await testee.collateralUtilization()).to.equal(0);

    let tokensMinted = 100n;
    await testee.mintToken(tokensMinted * precision, acc1.address)


    evmCurrentBlockTime += 3600;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let secsPassed = evmCurrentBlockTime - Number(await testee.inflLastUpdate())

    // The most accurate way to calculate inflation is a loop with 
    // for (let i = 0; i < secsPassed; i++) {
    //  `tokenPrice -= tokenPrice * inflRatePerSec`
    // }
    // but this is too slow so will an algorithm that has a very small precision error. 
    // div(_principal, pow(1+_rate, _age));
    // https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b
    let tokenPrice = 1e18;
    let rate = 1 + inflRatePerSec;
    tokenPrice /= rate ** secsPassed // The magic formula from https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b

    let actPriceRounded = Math.round(Number(await testee.tokenPrice()) / 10000000)
    let expPriceRounded = Math.round(tokenPrice / 10000000)
    expect(expPriceRounded).to.equal(actPriceRounded)

    // TODO check that total value of minted coins doesn't ecceed collateral threshold value.
    console.log('await testee.collateralUtilization()', Number(await testee.collateralUtilization()));

  });

});

// `beforeEach` will run before each test, re-deploying the contract every
// time. It receives a callback, which can be async.
beforeEach(async function () {
  [owner, acc1, acc2, acc3, acc4, acc5] = await ethers.getSigners();

  console.log("ownder address", owner.address)

  await hre.run("compile");

  var fact = await ethers.getContractFactory(path.join("tellorplayground", "contracts", "", "TellorPlayground.sol:TellorPlayground"));
  tellor = await fact.deploy("Tellor", "TRB");
  await tellor.deployed();
  console.log('tellor address', tellor.address);


  var fact = await ethers.getContractFactory("Token");
  collateral = await fact.deploy("Etherium", "ETH");
  await collateral.deployed();
  console.log('collateral address', tellor.address);


  var fact = await ethers.getContractFactory("Token");
  inflBenificiary = await fact.deploy("Beni", "BNF");
  await inflBenificiary.deployed();
  console.log('benificiary address', inflBenificiary.address);


  // Deploy the actual contract to test.
  fact = await ethers.getContractFactory("Main");
  testee = await fact.deploy(
    collateral.address,
    collateralID,
    collateralPriceGranularity,
    inflBenificiary.address,
    tellor.address,
    collateralName,
    collateralSymbol,
    tokenName,
    tokenSymbol,
    BigInt(inflRate)
  );
  await testee.deployed();
  console.log('token address', testee.address);


  // Prepare the initial state of the contracts.

  // Add price and rewind the evm as we want a price to be at least collateralPriceAge old.
  await tellor.submitValue(collateralID, collateralPrice)
  evmCurrentBlockTime = Math.round((Number(new Date().getTime())) / 1000) + Number(await testee.collateralPriceAge()) + 100
  await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
  await waffle.provider.send("evm_mine");

  await collateral.mint(owner.address, BigInt(1e25))
  await collateral.increaseAllowance(testee.address, BigInt(1e50));

  console.log('>>>>>>>>>>>>>> end of boostrap \n\n');


});
