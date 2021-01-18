import React from 'react';
import './KeyElements.scss';
import Icons from '../../Icons';
import { useMediaQuery } from 'react-responsive';

const KeyElements = () => {
  const isMobile = useMediaQuery({query: '(max-width: 480px)'})
  return (
    <div className="KeyElements">
      <p><span className="bold">Chorus</span>’ key components:</p>
      <div className="Element">
        <div className="ElementGraphic">
          <Icons.Anthem />
        </div>
        <div className="ElementTxt">
          <h4>Anthem:</h4>
          <p>A smart contract reffering to a specific implementation of Chorus, deployed from  the main Chorus deployer.<br /><br />Variables to set in an Anthem:</p>
        <div className="list">
          <ul>
            <li>Collateral Pairing {isMobile?<br/>:null}(e.g. YourToken/USD)</li>
            <li>Collateralization ratio (e.g. 150%)</li>
            <li>Liquidation penalty {isMobile?<br/>:null}(e.g. 5%)</li>
          </ul>
          <ul>
            <li>Inflation rate (e.g. 10%)</li>
            <li>Inflation Beneficiary (address)</li>
            <li>Owner (address)</li>
          </ul>

        </div>
        </div>
      </div>
      <div className="Element">
        <div className="ElementGraphic">
          <Icons.Notes />
        </div>
        <div className="ElementTxt">
          <h4>Notes:</h4>
          <p>Tokens to be used as community currency. They are issued by the Anthem-contract, and are therefor subject to the Anthem’s variables (inflation rate, liquidation penalty ,etc.). Each Anthem produces its specific Notes.</p>
        </div>
      </div>
    </div>
  );
}

export default KeyElements;