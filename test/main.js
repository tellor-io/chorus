const { expect } = require("chai");
const { fips } = require("crypto");
const path = require("path")

let owner, acc1, acc2, acc3, acc4, acc5;

let testee;
let tellor;

const precision = BigInt(1e18);
const collateralID = 1;
const collateralPriceGranularity = 1e6;
const collateralPrice = 100;
const collateralName = "Etherium";
const collateralSymbol = "ETH";
const tokenName = "Note";
const tokenSymbol = "NTO";

const inflRate = 5e17; // 50% compound inflation per year.
const tokenPrice = 1e18;

let secsPerYear = 365 * 24 * 60 * 60
var inflRatePerSec = ((inflRate / 1e10) / (secsPerYear * 10e7))

var evmCurrentBlockTime = Math.round((Number(new Date().getTime())) / 1000);

// The most accurate way to calculate inflation is a loop with
// for (let i = 0; i < secsPassed; i++) {
//  `tokenPrice -= tokenPrice * inflRatePerSec`
// }
// but this is too slow so will an algorithm that has a very small precision error.
// div(_principal, pow(1+_rate, _age));
// https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b
function tokenPriceInfl(secsPassed) {

  let rate = 1 + inflRatePerSec;
  tokenPriceInfl = tokenPrice / rate ** secsPassed // The magic formula from https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b

  return tokenPriceInfl;
}

describe("All tests", function () {
  it("Token Inflation", async function () {
    let collateralDeposit = 1000n;
    await testee.depositCollateral(collateralDeposit * precision)

    await testee.mintToken(100n * precision, acc1.address)
    evmCurrentBlockTime += secsPerYear;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let secsPassed = evmCurrentBlockTime - Number(await testee.inflLastUpdate())

    // Concatenated the decimal precision because there is a small rounding error.
    let actPriceRounded = Number(await testee.tokenPrice()).toString().substring(0, 7);
    let expPriceRounded = tokenPriceInfl(secsPassed).toString().substring(0, 7);
    expect(expPriceRounded).to.equal(actPriceRounded)
  });

  it("Collateral utilization", async function () {
    let collateralDeposit = 10n;
    await testee.depositCollateral(collateralDeposit * precision)
    expect(await testee.collateralUtilization()).to.equal(0)

    let tokensMinted = 499n;
    await testee.mintToken(tokensMinted * precision, acc1.address)

    expect(tokensMinted).to.equal(BigInt(await testee.tokenTotalSupply()) / precision)


    evmCurrentBlockTime += 100;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let secsPassed = evmCurrentBlockTime - Number(await testee.inflLastUpdate())

    let totalTokenValue = Number(tokensMinted) * tokenPrice
    let collateralValue = collateralDeposit * BigInt(collateralPrice) * precision

    let expCollateralUtilization = (totalTokenValue / Number(collateralValue) * 100)
    let actCollateralUtilization = (Number(await testee.collateralUtilization()) / Number(precision) * 100)
    expect(expCollateralUtilization).to.equal(actCollateralUtilization)
  });

  it("Should not allow minting tokens above the collateral threshold", async function () {
    let collateralDeposit = 10n;
    await testee.depositCollateral(collateralDeposit * precision)
    expect(await testee.collateralUtilization()).to.equal(0)

    // Collateral price is 100 so 499 minted tokens will put the system
    // into 49% utilization which is close to the 50% collateral thershold.
    // Collateral total value = 1000(100x10),
    // Tokens total value = 499(499x1).
    let tokensMinted = 499n;
    await testee.mintToken(tokensMinted * precision, acc1.address)

    expect(tokensMinted).to.equal(BigInt(await testee.tokenTotalSupply()) / precision)

    await expect(testee.mintToken(1n * precision, acc1.address)).to.be.reverted
    // Ensure the transaction didn't change the total supply
    expect(tokensMinted).to.equal(BigInt(await testee.tokenTotalSupply()) / precision)
  });
});

// `beforeEach` will run before each test, re-deploying the contract every
// time. It receives a callback, which can be async.
beforeEach(async function () {
  [owner, acc1, acc2, acc3, acc4, acc5] = await ethers.getSigners();

  var fact = await ethers.getContractFactory(path.join("tellorplayground", "contracts", "", "TellorPlayground.sol:TellorPlayground"));
  tellor = await fact.deploy("Tellor", "TRB");
  await tellor.deployed();

  var fact = await ethers.getContractFactory("Token");
  collateral = await fact.deploy("Etherium", "ETH");
  await collateral.deployed();

  var fact = await ethers.getContractFactory("Token");
  inflBenificiary = await fact.deploy("Beni", "BNF");
  await inflBenificiary.deployed();

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

  // Prepare the initial state of the contracts.

  // Add price and rewind the evm as the system uses a price at least collateralPriceAge old.
  await tellor.submitValue(collateralID, collateralPrice * collateralPriceGranularity)
  evmCurrentBlockTime = evmCurrentBlockTime + Number(await testee.collateralPriceAge()) + 100
  await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
  await waffle.provider.send("evm_mine");

  await collateral.mint(owner.address, BigInt(1e25))
  await collateral.increaseAllowance(testee.address, BigInt(1e50));

});
