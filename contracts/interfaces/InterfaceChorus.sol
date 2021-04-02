// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "../ERC20.sol";
// slither-disable-next-line missing-inheritance
interface InterfaceChorus {
    event CollateralThreshold(uint256);
    event CollateralPriceAge(uint256);
    event LiquidationPenatly(uint256);
    event WithdrawCollateral(
        address,
        uint256 collateralAmnt,
        uint256 collateralRatio
    );
    event WithdrawToken(address, uint256 tokenAmnt, uint256 collateralAmnt);
    event Liquidate(
        address,
        uint256 tokensAmnt,
        uint256 collateralAmnt,
        uint256 collateralPenalty
    );
    event MintTokens(
        address,
        uint256 amount,
        address to,
        uint256 collateralRatio
    );

    function setAdmin(address _newAdmin) external;

    function depositCollateral(uint256 wad) external;

    function withdrawCollateral(uint256 wad) external;

    function liquidate() external;

    function updateInflation() external;

    function collateralRatio() external view returns (uint256);

    function collateralPrice() external view returns (uint256);

    function setCollateralThreshold(uint256 wad) external;

    function setCollateralPriceAge(uint256 wad) external;

    function setLiquidationPenatly(uint256 wad) external;

    function mintToken(uint256 amount, address to) external;

    function tokenPrice() external view returns (uint256);

    function collateralBalance() external view returns (uint256);

    function withdrawToken(uint256 amount) external;

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);

    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    function allowance(address owner, address spender)
        external
        view
        returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    function increaseAllowance(address spender, uint256 addedValue)
        external
        returns (bool);

    function decreaseAllowance(address spender, uint256 subtractedValue)
        external
        returns (bool);
}
