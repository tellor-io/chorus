import React from 'react';
import './Steps.scss';
import ChorusButton from '../ChorusButton/ChorusButton';
import { useMediaQuery } from 'react-responsive';

function Steps() {
  const isMobile = useMediaQuery({query: '(max-width: 480px)'})

  return (
    <div className="Steps">
      <p className="StepsFirst">The flow of the <span className="bold">Chorus</span> protocol {isMobile?<br/>:null}is as such:</p>
      <div className="Step">
        <p>Issuing party deploys an <span className="bold">Anthem</span></p>
        <svg xmlns="http://www.w3.org/2000/svg" width="12.29" height="6.88" viewBox="0 0 12.29 6.88">
          <path d="M2642.013,1902.739s4.9,5.825,5.2,6.213a1.818,1.818,0,0,0,.181.2c2.517-1.639,5.843-5.788,6.908-6.7a5.561,5.561,0,0,0-1.959-.165c-1.277.072-8.187.21-8.826.21A6.868,6.868,0,0,0,2642.013,1902.739Z" transform="translate(-2642.013 -1902.271)"/>
        </svg>
      </div>
      <div className="Step">
        <p>Issuing party is owner of this  <span className="bold">Anthem</span> or transfers ownership</p>
        <svg xmlns="http://www.w3.org/2000/svg" width="12.29" height="6.88" viewBox="0 0 12.29 6.88">
          <path d="M2642.013,1902.739s4.9,5.825,5.2,6.213a1.818,1.818,0,0,0,.181.2c2.517-1.639,5.843-5.788,6.908-6.7a5.561,5.561,0,0,0-1.959-.165c-1.277.072-8.187.21-8.826.21A6.868,6.868,0,0,0,2642.013,1902.739Z" transform="translate(-2642.013 -1902.271)"/>
        </svg>
      </div>
      <div className="Step">
        <p>Owner set variables and locks collateral of their chosen token</p>
        <svg xmlns="http://www.w3.org/2000/svg" width="12.29" height="6.88" viewBox="0 0 12.29 6.88">
          <path d="M2642.013,1902.739s4.9,5.825,5.2,6.213a1.818,1.818,0,0,0,.181.2c2.517-1.639,5.843-5.788,6.908-6.7a5.561,5.561,0,0,0-1.959-.165c-1.277.072-8.187.21-8.826.21A6.868,6.868,0,0,0,2642.013,1902.739Z" transform="translate(-2642.013 -1902.271)"/>
        </svg>
      </div>
      <div className="Step">
        <p>Owner can now issue <span className="bold">Notes</span> as community currency</p>
        <svg xmlns="http://www.w3.org/2000/svg" width="12.29" height="6.88" viewBox="0 0 12.29 6.88">
          <path d="M2642.013,1902.739s4.9,5.825,5.2,6.213a1.818,1.818,0,0,0,.181.2c2.517-1.639,5.843-5.788,6.908-6.7a5.561,5.561,0,0,0-1.959-.165c-1.277.072-8.187.21-8.826.21A6.868,6.868,0,0,0,2642.013,1902.739Z" transform="translate(-2642.013 -1902.271)"/>
        </svg>
      </div>
      <p><span className="bold">Notes</span> are subject to inflation rate, new <span className="bold">Notes</span> are issued to Inflation Beneficiary</p>
      <div className="readwhitepaper">
        <p>Want to know more?</p>
        <ChorusButton txt="Read the whitepaper" link="https://docs.tellor.io/chorus/"/>
      </div>
    </div>
  );
}

export default Steps;