const { expect } = require("chai");

describe("Simple Token", function() {
  
  
  it("Should return the token symbol and name", async function() {
    const TokenFactory = await ethers.getContractFactory("Token");
    const token = await TokenFactory.deploy("TEST", "TST");
    
    await token.deployed();
    expect(await token.name()).to.equal("TEST");
    expect(await token.symbol()).to.equal("TST");
  });
});
