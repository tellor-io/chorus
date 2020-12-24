// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// The contract is also an ERC20 token which holds the collateral currency.
// It also holds the semi stable token state inside the `token` variable.
contract Token is ERC20 {
    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    // solhint-disable-next-line no-empty-blocks
    constructor(string memory n, string memory s) ERC20(n, s) {}
}
