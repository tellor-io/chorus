const { expect } = require("chai");
const { default: Decimal } = require("decimal.js");

let owner, acc1, acc2, acc3, acc4, benificiary;
let collateral;
let chorus;
let oracle;

const precision = BigInt(1e18);
const collateralPriceGranularity = 1e6;
const collateralPrice = 100;
const secsPerYear = 365 * 24 * 60 * 60
// At 10% the rounding error is 0.02%.
// At 50% the rounding error is 4%.
// It is realistic to assume that most project will not need a very high inflation.
const nominalRateYear = 0.1 //10%
const effRate = nominalToEffectiveInflation(new Decimal(nominalRateYear))
const inflRate = new Decimal(effRate).mul(1e18)
const inflRatePerSec = ((inflRate / 1e10) / (secsPerYear * 10e7))
const tokenPrice = 1e18;

var evmCurrentBlockTime = Math.round((Number(new Date().getTime())) / 1000);

// The most accurate way to calculate inflation is a loop with
// for (let i = 0; i < secsPassed; i++) {
//  `tokenPrice -= tokenPrice * inflRatePerSec`
// }
// but this is too slow so will an algorithm that has a very small precision error.
// div(_principal, pow(1+_rate, _age));
// https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b
function accrueInflation(principal, secsPassed, inflPerSec = inflRatePerSec) {
  let rate = 1 + inflPerSec;
  infl = principal / rate ** secsPassed
  return BigInt(infl);
}

function accrueInterest(principal, secsPassed) {
  let rate = 1 + inflRatePerSec;
  interest = principal * (rate ** secsPassed)
  return BigInt(interest - principal);
}


function nominalToEffectiveInflation(nominal) {
  let secsPerYearD = new Decimal(secsPerYear)
  let base = new Decimal(1.0).add(nominal.div(secsPerYearD))
  let j = base.pow(secsPerYearD)
  let k = j.sub(new Decimal(1.0))
  return k
}

// `beforeEach` will run before each test, re-deploying the contract every
// time. It receives a callback, which can be async.
beforeEach(async function () {
  // Using deployments.createFixture speeds up the tests as
  // the reset is done with evm_revert.
  let res = await setupTest()
  oracle = res.oracle
  collateral = res.collateral
  chorus = res.chorus
});

const setupTest = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers }, options) => {
  [owner, acc1, acc2, acc3, acc4, benificiary] = await ethers.getSigners();
  let oracleDepl = await deployments.deploy('MockOracle', {
    from: owner.address,
  })
  let oracle = await ethers.getContract("MockOracle");
  let collateralDepl = await deployments.deploy('Token', {
    from: owner.address,
    args: [
      "Ethereum",
      "ETH",
      false
    ],
  })
  let collateral = await ethers.getContract("Token");
  // Deploy the actual contract to test.
  await deployments.deploy('Chorus', {
    from: owner.address,
    args: [
      oracleDepl.address,
      collateralDepl.address,
      1,//collateralID e.g. 1
      collateralPriceGranularity,
      "Note",//tokenName
      "NTO",//tokenSymbol
      BigInt(Math.floor(inflRate)).toString(),
      benificiary.address,
      false
    ],
  });
  let chorus = await ethers.getContract("Chorus");
  // Prepare the initial state of the contracts.
  // Add price and rewind the evm as the system uses a price at least collateralPriceAge old.
  await oracle.submitValue(1, collateralPrice * collateralPriceGranularity)
  evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
  await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
  await waffle.provider.send("evm_mine");
  await collateral.mint(owner.address, 10n * precision)
  await collateral.increaseAllowance(chorus.address, BigInt(1e50));
  return { oracle, collateral, chorus }
});

describe("All tests", function () {
  it("Token Inflation", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision)
    let mintedTokens = 100n * precision
    await chorus.mintToken(mintedTokens, acc1.address)
    evmCurrentBlockTime += secsPerYear;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let secsPassed = evmCurrentBlockTime - Number(await chorus.inflLastUpdate())
    let actPrice = Number(await chorus.tokenPrice())
    let expPrice = Number(accrueInflation(tokenPrice, secsPassed))
    // There is a rounding error so ignore the difference after the rounding error.
    expect(expPrice).to.be.closeTo(actPrice, 1600000000)
  });

  it("Effective Rate", async function () {
    let currPrice = await chorus.tokenPrice()
    var evmCurrentBlockTime = Math.round((Number(new Date().getTime())) / 1000);
    evmCurrentBlockTime += secsPerYear;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let actPrice = Number(await chorus.tokenPrice())
    // There is a rounding error so ignore the difference after the rounding error.
    // The total precision is enough that this rounding shouldn't matter.
    expect(currPrice - (currPrice * nominalRateYear)).to.be.closeTo(actPrice, 200000000000000)
  });

  it("Minting tokens to the inflation beneficiary", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision)
    let mintedTokens = 100n * precision
    await chorus.mintToken(mintedTokens, acc1.address)
    evmCurrentBlockTime += secsPerYear;
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    let secsPassed = evmCurrentBlockTime - Number(await chorus.inflLastUpdate())
    expect(await chorus.balanceOf(benificiary.address)).to.equal(0) // Start with 0
    let expInflBeneficiaryTokens = Number(accrueInterest(await chorus.totalSupply(), secsPassed))
    await chorus.updateInflation()
    let actInflBeneficiaryTokens = Number(await chorus.balanceOf(benificiary.address))
    // There is a rounding error so ignore the difference after the rounding error.
    // The total precision is enough that this rounding shouldn't matter.
    expect(actInflBeneficiaryTokens).to.be.closeTo(expInflBeneficiaryTokens, 20000000000000)
  })

  it("Collateral deposit and ratio", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision)
    expect(await collateral.balanceOf(chorus.address)).to.equal(collateralDeposit * precision)
    expect(await chorus.collateralRatio()).to.equal(0)
    let tokensMinted = 499n;
    await chorus.mintToken(tokensMinted * precision, acc1.address)
    expect(tokensMinted).to.equal(BigInt(await chorus.totalSupply()) / precision)
    let totalTokenValue = Number(tokensMinted) * tokenPrice
    let collateralValue = collateralDeposit * BigInt(collateralPrice) * precision
    let expcollateralRatio = 100 + (totalTokenValue / Number(collateralValue) * 100)
    let actcollateralRatio = (Number(await chorus.collateralRatio()) / Number(precision) * 100)
    expect(expcollateralRatio).to.equal(actcollateralRatio)
  });

  it("Should not allow minting tokens above the collateral threshold", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision)
    expect(await chorus.collateralRatio()).to.equal(0)
    // Collateral price is 100 so 499 minted tokens will put the system
    // into 49% utilization which is close to the default 150% collateral thershold.
    // Collateral total value = 1000(100x10),
    // Tokens total value = 499(499x1).
    let tokensMinted = 499n;
    await chorus.mintToken(tokensMinted * precision, acc1.address)
    expect(tokensMinted).to.equal(BigInt(await chorus.totalSupply()) / precision)
    await expect(chorus.mintToken(1n * precision, acc1.address)).to.be.reverted
    // Ensure the transaction didn't change the total supply
    expect(tokensMinted).to.equal(BigInt(await chorus.totalSupply()) / precision)
  });

  it("Withdraw collateral", async function () {
    let collateralDeposit = 10n;
    await chorus.depositCollateral(collateralDeposit * precision)
    expect(await collateral.balanceOf(owner.address)).to.equal(0);
    expect(await collateral.balanceOf(chorus.address)).to.equal(collateralDeposit * precision);
    // Collateral price is 100 so total collateral value is 1000
    // 400 minted tokens are worth 400 which is 40% collateral utilization.
    // This is 10% below the  50% collateral threshold so
    // should be able to withdraw 10% of the collateral.
    let tokensMinted = 400n;
    await chorus.mintToken(tokensMinted * precision, acc1.address)
    let expWithdrawAmnt = 1n * precision;
    await chorus.withdrawCollateral(expWithdrawAmnt)
    expect(await collateral.balanceOf(owner.address)).to.equal(expWithdrawAmnt);
    await expect(chorus.withdrawCollateral(1n * precision), "collateral withdraw puts the system below the threshold").to.be.reverted
    expect(await collateral.balanceOf(owner.address)).to.equal(expWithdrawAmnt);
  })

  it("Liquidation", async function () {
    // Put the system into 40% collateral utilization.
    let collateralDeposit = 10.0
    await chorus.depositCollateral(BigInt(collateralDeposit) * precision)
    let tokensTotalSupply = 400
    let acc1TknPercentSupply = 0.4 // 40% ot the total supply.
    let acc2TknPercentSupply = 0.6 // 60% ot the total supply.
    await chorus.mintToken(BigInt(tokensTotalSupply * acc1TknPercentSupply) * precision, acc1.address)
    await chorus.mintToken(BigInt(tokensTotalSupply * acc2TknPercentSupply) * precision, acc2.address)
    // Reduce the collateral price by 50% to put the system into liquation state.
    // Rewind the machine because oracle price needs to be at least collateralPriceAge old.
    await oracle.submitValue(1, (collateralPrice / 4) * collateralPriceGranularity)
    evmCurrentBlockTime = evmCurrentBlockTime + Number(await chorus.collateralPriceAge()) + 100
    await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
    await waffle.provider.send("evm_mine");
    // The account should receive the collateral liquidation amount
    // equal to its total supply percent in tokens.
    let account = acc1
    expect(await collateral.balanceOf(account.address)).to.equal(0)
    await chorus.connect(account).liquidate();
    expect(await collateral.balanceOf(account.address)).to.equal(BigInt(collateralDeposit * acc1TknPercentSupply * Number(precision)));
    expect(await chorus.balanceOf(account.address)).to.equal(0);
    expect(await chorus.collateralBalance()).to.equal(BigInt(collateralDeposit * (1 - acc1TknPercentSupply) * Number(precision)));
    await expect(chorus.connect(account).liquidate()).to.be.reverted
    // Set liquidation penaly and test that collateral penalty is transfered to the benificiary address.
    let liquidationPenatly = 0.15 // 15%
    chorus.setLiquidationPenatly(BigInt(liquidationPenatly * 100) * precision)
    // The account should receive the collateral liquidation amount 
    // equal to its total supply percent in tokens minus the liquidation penalty.
    account = acc2
    expect(await collateral.balanceOf(account.address)).to.equal(0);
    expect(await collateral.balanceOf(benificiary.address)).to.equal(0);
    await chorus.connect(account).liquidate();
    let expAccountCollat = collateralDeposit * (acc2TknPercentSupply - (acc2TknPercentSupply * liquidationPenatly)) * Number(precision)
    expect(await collateral.balanceOf(account.address)).to.equal(BigInt(expAccountCollat));
    expect(await chorus.balanceOf(account.address)).to.equal(0);
    expect(await chorus.collateralBalance()).to.equal(0);
    // Benificiary address should receive the penalty.
    let expBenificiaryCollat = (collateralDeposit * acc2TknPercentSupply * liquidationPenatly).toFixed(2) * Number(precision)
    expect(await collateral.balanceOf(benificiary.address)).to.equal(BigInt(expBenificiaryCollat));
    await expect(chorus.connect(account).liquidate()).to.be.reverted
  })

  it("Tokens Withdraw", async function () {
    let collateralDeposit = 10n
    let mintedTokens = 400n
    let account = acc1
    await chorus.depositCollateral(collateralDeposit * precision)
    await chorus.mintToken(mintedTokens * precision, account.address)
    let withdrawCount = 50n
    let expCollateralWithdrawn = 0
    for (; mintedTokens > 0;) {
      mintedTokens -= withdrawCount
      evmCurrentBlockTime += 60;
      await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
      await waffle.provider.send("evm_mine");
      let collatPrice = Number(BigInt(collateralPrice) * precision)
      await chorus.connect(account).requestWithdrawToken(withdrawCount * precision);
      let ts = await chorus.totalSupply()
      _waitPeriod = 1 + 100* Number(withdrawCount * precision) / Number(ts) / 5
      evmCurrentBlockTime += 86400 * Math.floor(_waitPeriod) + 10;
      await waffle.provider.send("evm_setNextBlockTimestamp", [evmCurrentBlockTime]);
      let secsPassed = evmCurrentBlockTime - Number(await chorus.inflLastUpdate())
      let tknPrice = Number(accrueInflation(tokenPrice, secsPassed))
      await chorus.connect(account).withdrawToken();
      expect(await chorus.balanceOf(account.address)).to.equal((mintedTokens) * precision);
      let priceRatio = tknPrice / collatPrice
      expCollateralWithdrawn += Number(priceRatio * Number(withdrawCount * precision))
      let actCollateralWithdrawn = Number(await collateral.balanceOf(account.address))
      // There is a rounding error so ignore the difference after the rounding error.
      // The total precision is enough that this rounding shouldn't matter.
      expect(actCollateralWithdrawn).to.be.closeTo(expCollateralWithdrawn, 700000000000)
      expect(Number(await chorus.collateralBalance())).to.be.closeTo(Number(collateralDeposit * precision - BigInt(expCollateralWithdrawn)), 70000000000);
    }
    await expect(chorus.withdrawToken(1n), "withdraw tokens when balance should be zero").to.be.reverted
  })
});