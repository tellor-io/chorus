import React from 'react';
import './Footer.scss';
import Icons from '../../Icons';

function Footer() {
  return (
    <div className="Footer">
      <div className="Contact">
        <p>If you’d like to help us build it, start a community currency of your own, or just learn more about Tellor, please reach out to <a alt="Mail to chorus@tellor.io" href="mailto:chorus@tellor.io">chorus@tellor.io</a> or check out our website and subscribe for updates: <a href="www.tellor.io" alt="www.tellor.io">www.tellor.io</a>.</p>
      </div>
      <div className="ActualFooter">
        <div className="LogoBox">
          <p><a href="https://tellor.io" className="tellorLink" target="_blank" rel="noopener noreferrer">tellor </a>presents</p>
          <Icons.Logo className="Logo" fill="white" height="26px" width="26px" />
          <p>CHORUS</p>
        </div>
        <p className="copyw">&copy; 2021</p>
      </div>
    </div>
  );
}

export default Footer;