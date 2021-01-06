const { expect } = require("chai");
const path = require("path")

let owner, acc1, acc2, acc3, acc4, benificiary;
let collateral;

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

const secsPerYear = 365 * 24 * 60 * 60
const inflRatePerSec = ((inflRate / 1e10) / (secsPerYear * 10e7))

var evmCurrentBlockTime = Math.round((Number(new Date().getTime())) / 1000);

// The most accurate way to calculate inflation is a loop with
// for (let i = 0; i < secsPassed; i++) {
//  `tokenPrice -= tokenPrice * inflRatePerSec`
// }
// but this is too slow so will an algorithm that has a very small precision error.
// div(_principal, pow(1+_rate, _age));
// https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b
function accrueInflation(principal, secsPassed) {
  let rate = 1 + inflRatePerSec;
  infl = principal / rate ** secsPassed // The magic formula from https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b

  return BigInt(infl);
}

function accrueInterest(principal, secsPassed) {
  let rate = 1 + inflRatePerSec;
  interest = principal * (rate ** secsPassed)

  return BigInt(interest - principal);
}

describe("All tests", function () {
  it("Token Inflation", async function () {
    let collateralDeposit = 10n;
    await testee.depositCollateral(collateralDeposit * precision)

    let mintedTokens = 100n * precision
    await testee.mintToken(mintedTokens, acc1.address)
    evmCurrentBlockTime += secsPerYear;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let secsPassed = evmCurrentBlockTime - Number(await testee.inflLastUpdate())

    let actPrice = Number(await testee.tokenPrice())
    let expPrice = Number(accrueInflation(tokenPrice, secsPassed))
    // There is a rounding error so ignore the difference after the rounding error.
    // The total precision is enough that this rounding shouldn't matter.
    expect(expPrice).to.be.closeTo(actPrice, 1500000000)
  });

  it("Minting tokens to the inflation benificiary", async function () {
    let collateralDeposit = 10n;
    await testee.depositCollateral(collateralDeposit * precision)

    let mintedTokens = 100n * precision
    await testee.mintToken(mintedTokens, acc1.address)
    evmCurrentBlockTime += secsPerYear;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let secsPassed = evmCurrentBlockTime - Number(await testee.inflLastUpdate())

    expect(await testee.tokenBalanceOf(benificiary.address)).to.equal(0) // Start with 0
    let expInflBeneficiaryTokens = Number(accrueInterest(await testee.tokenTotalSupply(), secsPassed))

    await testee.updateInflation()
    let actInflBeneficiaryTokens = Number(await testee.tokenBalanceOf(benificiary.address))
    // There is a rounding error so ignore the difference after the rounding error.
    // The total precision is enough that this rounding shouldn't matter.
    expect(actInflBeneficiaryTokens).to.be.closeTo(expInflBeneficiaryTokens, 4000000000000)
  })


  it("Collateral deposit and utilization", async function () {
    let collateralDeposit = 10n;
    await testee.depositCollateral(collateralDeposit * precision)
    expect(await collateral.balanceOf(testee.address)).to.equal(collateralDeposit * precision)
    expect(await testee.collateralUtilization()).to.equal(0)

    let tokensMinted = 499n;
    await testee.mintToken(tokensMinted * precision, acc1.address)

    expect(tokensMinted).to.equal(BigInt(await testee.tokenTotalSupply()) / precision)

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

  it("Withdraw collateral", async function () {
    let collateralDeposit = 10n;
    await testee.depositCollateral(collateralDeposit * precision)
    expect(await collateral.balanceOf(owner.address)).to.equal(0);
    // Collateral price is 100 so total collateral value is 1000
    // 400 minted tokens are worth 400 which is 40% collateral utilization.
    // This is 10% below the  50% collateral thershold so
    // should be able to withdraw 10% of the collateral.
    let tokensMinted = 400n;
    await testee.mintToken(tokensMinted * precision, acc1.address)
    let expWithdrawAmnt = 1n * precision;
    await testee.withdrawCollateral(expWithdrawAmnt)
    expect(await collateral.balanceOf(owner.address)).to.equal(expWithdrawAmnt);

    await expect(testee.withdrawCollateral(1n * precision), "collateral withdraw puts the system below the threshold").to.be.reverted
    expect(await collateral.balanceOf(owner.address)).to.equal(expWithdrawAmnt);
  })

  it("Liquidation", async function () {
    // Put the system into 40% collateral utilization.
    let collateralDeposit = 10.0
    await testee.depositCollateral(BigInt(collateralDeposit) * precision)
    let tokensTotalSupply = 400
    let acc1TknPercentSupply = 0.4 // 40% ot the total supply.
    let acc2TknPercentSupply = 0.6 // 60% ot the total supply.
    await testee.mintToken(BigInt(tokensTotalSupply * acc1TknPercentSupply) * precision, acc1.address)
    await testee.mintToken(BigInt(tokensTotalSupply * acc2TknPercentSupply) * precision, acc2.address)

    // Reduce the collateral price by 50% to put the system into liquation state.
    // Rewind the machine because oracle price needs to be at least collateralPriceAge old.
    await tellor.submitValue(collateralID, (collateralPrice / 4) * collateralPriceGranularity)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await testee.collateralPriceAge()) + 100
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");

    // The account should receive the collateral liquidation amount
    // equal to its total supply percent in tokens.
    let account = acc1
    expect(await collateral.balanceOf(account.address)).to.equal(0)

    await testee.connect(account).liquidate();

    expect(await collateral.balanceOf(account.address)).to.equal(BigInt(collateralDeposit * acc1TknPercentSupply * Number(precision)));
    expect(await testee.tokenBalanceOf(account.address)).to.equal(0);
    expect(await testee.collateralBalance()).to.equal(BigInt(collateralDeposit * (1 - acc1TknPercentSupply) * Number(precision)));
    await expect(testee.connect(account).liquidate()).to.be.reverted


    // Set liquidation penaly and test that collateral penalty is transfered to the benificiary address.
    let liquidationPenatly = 0.15 // 15%
    testee.setLiquidationPenatly(BigInt(liquidationPenatly * 100) * precision)


    // The account should receive the collateral liquidation amount 
    // equal to its total supply percent in tokens minus the liquidation penalty.
    account = acc2
    expect(await collateral.balanceOf(account.address)).to.equal(0);
    expect(await collateral.balanceOf(benificiary.address)).to.equal(0);
    await testee.connect(account).liquidate();

    let expAccountCollat = collateralDeposit * (acc2TknPercentSupply - (acc2TknPercentSupply * liquidationPenatly)) * Number(precision)
    expect(await collateral.balanceOf(account.address)).to.equal(BigInt(expAccountCollat));
    expect(await testee.tokenBalanceOf(account.address)).to.equal(0);
    expect(await testee.collateralBalance()).to.equal(0);
    // Benificiary address should receive the penalty.
    let expBenificiaryCollat = (collateralDeposit * acc2TknPercentSupply * liquidationPenatly).toFixed(2) * Number(precision)
    expect(await collateral.balanceOf(benificiary.address)).to.equal(BigInt(expBenificiaryCollat));
    await expect(testee.connect(account).liquidate()).to.be.reverted



  })

  it("Tokens Withdraw", async function () {
    let collateralDeposit = 10n
    let mintedTokens = 400n
    let account = acc1
    await testee.depositCollateral(collateralDeposit * precision)
    await testee.mintToken(mintedTokens * precision, account.address)

    let withdrawCount = 50n
    let expCollateralWithdrawn = 0
    for (; mintedTokens > 0;) {
      mintedTokens -= withdrawCount
      evmCurrentBlockTime += 60;
      await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
      await waffle.provider.send("evm_mine");
      let secsPassed = evmCurrentBlockTime - Number(await testee.inflLastUpdate())

      let tknPrice = Number(accrueInflation(tokenPrice, secsPassed))
      let collatPrice = Number(BigInt(collateralPrice) * precision)

      await testee.connect(account).withdrawToken(withdrawCount * precision);
      expect(await testee.tokenBalanceOf(account.address)).to.equal((mintedTokens) * precision);

      let priceRatio = tknPrice / collatPrice
      expCollateralWithdrawn += Number(priceRatio * Number(withdrawCount * precision))
      let actCollateralWithdrawn = Number(await collateral.balanceOf(account.address))

      // There is a rounding error so ignore the difference after the rounding error.
      // The total precision is enough that this rounding shouldn't matter.
      expect(actCollateralWithdrawn).to.be.closeTo(expCollateralWithdrawn, 70000000000)
      expect(Number(await testee.collateralBalance())).to.be.closeTo(Number(collateralDeposit * precision - BigInt(expCollateralWithdrawn)), 70000000000);
    }

    await expect(testee.withdrawToken(1n), "withdraw tokens when balance should be zero").to.be.reverted
  })
});

// `beforeEach` will run before each test, re-deploying the contract every
// time. It receives a callback, which can be async.
beforeEach(async function () {
  [owner, acc1, acc2, acc3, acc4, benificiary] = await ethers.getSigners();

  var fact = await ethers.getContractFactory(path.join("tellorplayground", "contracts", "", "TellorPlayground.sol:TellorPlayground"));
  tellor = await fact.deploy("Tellor", "TRB");
  await tellor.deployed();

  var fact = await ethers.getContractFactory("Token");
  collateral = await fact.deploy("Etherium", "ETH");
  await collateral.deployed();

  // Deploy the actual contract to test.
  fact = await ethers.getContractFactory("Main");
  testee = await fact.deploy(
    tellor.address,
    collateral.address,
    collateralID,
    collateralPriceGranularity,
    collateralName,
    collateralSymbol,
    tokenName,
    tokenSymbol,
    BigInt(inflRate),
    benificiary.address
  );
  await testee.deployed();

  // Prepare the initial state of the contracts.

  // Add price and rewind the evm as the system uses a price at least collateralPriceAge old.
  await tellor.submitValue(collateralID, collateralPrice * collateralPriceGranularity)
  evmCurrentBlockTime = evmCurrentBlockTime + Number(await testee.collateralPriceAge()) + 100
  await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
  await waffle.provider.send("evm_mine");

  await collateral.mint(owner.address, 10n * precision)
  await collateral.increaseAllowance(testee.address, BigInt(1e50));

});
