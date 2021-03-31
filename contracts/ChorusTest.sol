// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "./Chorus.sol";
import "./MockOracle.sol";
import "./ERC20.sol";

contract ChorusTest is Chorus {
    ITellor public oracle = ITellor(new MockOracle());
    Mintable public collateral = new Mintable("Ethereum", "ETH");

    uint256 public constant collateralDeposit = 1e19;

    // 10% effective inf rate.
    constructor()
        Chorus(
            payable(address(oracle)),
            address(collateral),
            1,
            1000000,
            "Note",
            "NTO",
            105170917901244404,
            address(0x1)
        )
    {
        admin = 0x0e93f23278161bCa6F22D6268ca44691042ed437;
        collateral.mint(admin, collateralDeposit);
    }

    function echidna_colateral_balance() public view returns (bool) {
        return collateralToken.balanceOf(admin) == collateralDeposit;
    }

    function echidna_total_supply() public view returns (bool) {
        return totalSupply() == 0;
    }
}
