import React from 'react';
import './Header.scss';
import Icons from '../../Icons';
import { Button } from 'antd';
import ChorusButton from '../ChorusButton/ChorusButton';
import { useMediaQuery } from 'react-responsive';

function Header() {
  const isMobile = useMediaQuery({query: '(max-width: 810px)'})

  return (
    <div className="Header">
      <Icons.Logo className="HeaderLogo" width={isMobile?"72px":"82px"} />
      <h1>Write an Anthem.</h1>
      <p className="HeaderIntro"><span className="bold">Chorus</span> is a structure for enabling anyone to create and issue semi-stablecoins on Ethereum for use in their own ecosystem.</p>
      <ChorusButton txt="Read the whitepaper" link="https://docs.tellor.io/chorus/"/>
      <div className="HeaderBackground">
        <p>Throughout history, nations have used currency and monetary policy to further the unique goals of their economy.<br /><br />By allowing the creation of non-state-backed currencies with flexible monetary policies, Chorus can be used to support the specific goals of individual communities and organizations.</p>
      </div>

    </div>
  );
}

export default Header;