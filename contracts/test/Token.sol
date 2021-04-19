// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;
import "../ERC20.sol";
// The contract is also an ERC20 token which holds the collateral currency.
// It also holds the semi stable token state inside the `token` variable.
contract Token is ERC20 {
    // solhint-disable-next-line no-empty-blocks
    constructor(string memory n, string memory s, bool _isWhitelisted) ERC20(n, s, _isWhitelisted) {}

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
