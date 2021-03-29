// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./Math.sol";

// Borrowed from https://github.com/wolflo/solidity-interest-helper.
// Inspired by https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b
// Using DSMath from DappHub https://github.com/dapphub/ds-math

/**
 * @title Interest
 * @author Nick Ward
 * @dev Uses DSMath's wad and ray math to implement (approximately)
 * continuously compounding interest by calculating discretely compounded
 * interest compounded every second.
 */
contract Inflation is DSMath {
    //// Fixed point scale factors
    // wei -> the base unit
    // wad -> wei * 10 ** 18. 1 ether = 1 wad, so 0.5 ether can be used
    //      to represent a decimal wad of 0.5
    // ray -> wei * 10 ** 27

    // Go from wad (10**18) to ray (10**27)
    function wadToRay(uint256 _wad) internal pure returns (uint256) {
        return mul(_wad, 10**9);
    }

    // Go from wei to ray (10**27)
    function weiToRay(uint256 _wei) internal pure returns (uint256) {
        return mul(_wei, 10**27);
    }

    // The most accurate way to calculate inflation is a loop with
    // for (let i = 0; i < secsPassed; i++) {
    //  `tokenPrice -= tokenPrice * inflRatePerSec`
    // }
    // but this is too slow and expencive so this is an algorithm that has a very small precision error.
    // The magic formula from https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b
    function accrueInflation(
        uint256 _principal,
        uint256 _rate,
        uint256 _age
    ) internal pure returns (uint256) {
        return rdiv(_principal, rpow(_rate, _age));
    }

    /**
     * @dev Uses an approximation of continuously compounded interest
     * (discretely compounded every second)
     * @param _principal The principal to calculate the interest on.
     *   Accepted in wei.
     * @param _rate The interest rate. Accepted as a ray representing
     *   1 + the effective interest rate per second, compounded every
     *   second. As an example:
     *   I want to accrue interest at a nominal rate (i) of 5.0% per year
     *   compounded continuously. (Effective Annual Rate of 5.127%).
     *   This is approximately equal to 5.0% per year compounded every
     *   second (to 8 decimal places, if max precision is essential,
     *   calculate nominal interest per year compounded every second from
     *   your desired effective annual rate). Effective Rate Per Second =
     *   Nominal Rate Per Second compounded every second = Nominal Rate
     *   Per Year compounded every second * conversion factor from years
     *   to seconds
     *   Effective Rate Per Second = 0.05 / (365 days/yr * 86400 sec/day) = 1.5854895991882 * 10 ** -9
     *   The value we want to send this function is
     *   1 * 10 ** 27 + Effective Rate Per Second * 10 ** 27
     *   = 1000000001585489599188229325
     *   This will return 5.1271096334354555 Dai on a 100 Dai principal
     *   over the course of one year (31536000 seconds)
     * @param _age The time period over which to accrue interest. Accepted
     *   in seconds.
     * @return The new principal as a wad. Equal to original principal +
     *   interest accrued
     */
    function accrueInterest(
        uint256 _principal,
        uint256 _rate,
        uint256 _age
    ) internal pure returns (uint256) {
        return rmul(_principal, rpow(_rate, _age));
    }

    /**
     * @dev Takes in the desired nominal interest rate per year, compounded
     *   every second (this is approximately equal to nominal interest rate
     *   per year compounded continuously). Returns the ray value expected
     *   by the accrueInterest function
     * @param _rateWad A wad of the desired nominal interest rate per year,
     *   compounded continuously. Converting from ether to wei will effectively
     *   convert from a decimal value to a wad.
     *   So 5% rate should be input as yearlyRateToRay( 0.05 ether )
     * @return 1 * 10 ** 27 + Effective Interest Rate Per Second * 10 ** 27
     */

    function yearlyRateToPerSec(uint256 _rateWad)
        internal
        pure
        returns (uint256)
    {
        return
            add(
                wadToRay(1 ether),
                rdiv(wadToRay(_rateWad), weiToRay(365 * 86400))
            );
    }
}
