// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "./interfaces/ITellor.sol";

/** 
 @author Tellor Inc.
 @title OracleGetter
 @dev a way to access Tellor variables
**/
contract OracleGetter {
    ITellor private tellor;

    /**
     * @dev Constructor for the oracle getters
     * @param _tellor the tellor address
     */
    constructor(address payable _tellor) {
        tellor = ITellor(_tellor);
    }
    
    /**
     * @dev Allows the user to get the first value for the requestId before the specified timestamp
     * @param _requestId is the requestId to look up the value for
     * @param _timestamp before which to search for first verified value
     * @return _ifRetrieve bool true if it is able to retreive a value, the value, and the value's timestamp
     * @return _value the value retrieved
     * @return _timestampRetrieved the value's timestamp
     */
    function _getDataBefore(uint256 _requestId, uint256 _timestamp)
        internal
        view
        returns (
            bool _ifRetrieve,
            uint256 _value,
            uint256 _timestampRetrieved
        )
    {
        (bool _found, uint256 _index) =
            _getIndexForDataBefore(_requestId, _timestamp);
        if (!_found) return (false, 0, 0);
        uint256 _time =
            tellor.getTimestampbyRequestIDandIndex(_requestId, _index);
        _value = tellor.retrieveData(_requestId, _time);
        //If value is diputed it'll return zero
        if (_value > 0) return (true, _value, _time);
        return (false, 0, 0);
    }

    /**
     * @dev Internal function to get the index of the Tellor data
     * @param _requestId requestID for Tellor data feed
     * @param _timestamp timestamp of request
     */
    /* solhint-disable */
    function _getIndexForDataBefore(uint256 _requestId, uint256 _timestamp)
        internal
        view
        returns (bool, uint256)
    {
        uint256 _count = tellor.getNewValueCountbyRequestId(_requestId);
        if (_count > 0) {
            uint256 _middle;
            uint256 _start = 0;
            uint256 _end = _count - 1;
            uint256 _time;
            //Checking Boundaries to short-circuit the algorithm
            _time = tellor.getTimestampbyRequestIDandIndex(_requestId, _start);
            if (_time >= _timestamp) return (false, 0);
            _time = tellor.getTimestampbyRequestIDandIndex(_requestId, _end);
            if (_time < _timestamp) return (true, _end);
            //Since the value is within our boundaries, do a binary search
            while (true) {
                _middle = (_end - _start) / 2 + 1 + _start;
                _time = tellor.getTimestampbyRequestIDandIndex(
                    _requestId,
                    _middle
                );
                if (_time < _timestamp) {
                    //get imeadiate next value
                    uint256 _nextTime =
                        tellor.getTimestampbyRequestIDandIndex(
                            _requestId,
                            _middle + 1
                        );
                    if (_nextTime >= _timestamp) {
                        return (true, _middle);//_time is correct
                    } else {
                        //look from middle + 1(next value) to end
                        _start = _middle + 1;
                    }
                } else {
                    uint256 _prevTime =
                        tellor.getTimestampbyRequestIDandIndex(
                            _requestId,
                            _middle - 1
                        );
                    if (_prevTime < _timestamp) {
                        // _prevtime is correct
                        return (true, _middle - 1);
                    } else {
                        //look from start to middle -1(prev value)
                        _end = _middle - 1;
                    }
                }
            }
        }
        return (false, 0);
    }
}
