
const { expect, assert } = require("chai");
const { default: Decimal } = require("decimal.js");

let owner, acc1, acc2, acc3, acc4, benificiary;
let token
const precision = BigInt(1e18);

describe("Token / ERC20 tests", function () {
  it("Test Token / Whitelisting Functions", async function () {
    [owner, acc1, acc2, acc3, acc4, benificiary] = await ethers.getSigners();
    await deployments.deploy('Token', {
        from: owner.address,
        args: [
          "Ethereum",
          "ETH",
          true
        ],
      })
    token = await ethers.getContract("Token");
    let token1 = token.connect(acc1);
    assert(await token.name() == "Ethereum", "token name should be correct")
    assert(await token.symbol() == "ETH", "token symbol should be correct")
    assert(await token.isWhitelistedSystem(), "system should be whitelisted")
    assert(await token.whitelistAdmin() == owner.address, "token owner should be correct")
    await token.setWhitelistAdmin(acc1.address);
    assert(await token.whitelistAdmin() == acc1.address, "token owner should be correct once changed")
    await token1.setWhitelistedAmount(acc2.address,BigInt(100) * precision);
    await token1.setWhitelistedAmount(acc1.address,BigInt(100) * precision);
    assert(await token.whitelistedAmount(acc2.address) == BigInt(100) * precision, "whitelisting amount should work")
    await token.mint(acc1.address,BigInt(100) * precision)
    await token1.transfer(acc2.address,BigInt(50)*precision)
    assert(await token.balanceOf(acc2.address) == BigInt(50) * precision, "token balance should transfer")
    await expect(token.mint(acc1.address,BigInt(100) * precision)).to.be.reverted
    await expect(token1.transfer(acc3.address,BigInt(10) * precision)).to.be.reverted
    await token1.setWhitelistedAmount(acc1.address,0);
    await expect(token1.transfer(acc2.address,BigInt(10) * precision)).to.be.reverted
  })
});