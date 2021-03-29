// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "./Chorus.sol";
import "./MockOracle.sol";
import "./ERC20.sol";

contract ChorusTest is Chorus {
    ITellor public oracle = ITellor(new MockOracle());
    ERC20 public collateral = new ERC20("Ethereum", "ETH");

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
            address(0x0)
        )
    {}

    function echidna_check_balance() public pure returns (bool) {
        return true;
    }
}
