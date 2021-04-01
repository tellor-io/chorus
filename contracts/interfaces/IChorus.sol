// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "../ERC20.sol";

interface IChorus {
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

    address external admin = msg.sender;
    uint256 external collateralID; // The collateral id used to check the Tellor oracle for its USD price.
    uint256 external collateralPriceGranularity;
    ERC20 external collateralToken;
    uint256 external collateralThreshold = 15e17; // 150%.
    uint256 external collateralPriceAge = 3600; // 1h.
    uint256 external liquidationPenatly = 0;
    uint256 external inflRatePerSec;
    uint256 external inflLastUpdate = block.timestamp;
    address external inflBeneficiary; // Where to send the inflation tokens.

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
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender,address recipient,uint256 amount) external virtual override returns (bool); 
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
}
