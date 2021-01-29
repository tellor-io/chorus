import React, { useState } from 'react';
import './Nav.scss';
import Icons from '../../Icons';
import { slide as Menu } from 'react-burger-menu';
import { useMediaQuery } from 'react-responsive';

const Nav = (props) => {
    const isMobile = useMediaQuery({ query: '(max-width: 810px) and (-webkit-min-device-pixel-ratio: 2)' });


    const [menuOpen, setMenuOpen] = useState(false);

    const handleClick = (ref) => {
        if (ref === "RefA") {
            props.onClickRefA();
        }
        if (ref === "RefB") {
            props.onClickRefB();
        }
        setMenuOpen(false);
    }

    const handleStateChange = (ref) => {
        if (ref.isOpen) {
            setMenuOpen(true);
        }
    }

    return (
        <div className="Nav">
            {isMobile ?
                <div className="Nav_inner">
                    <Menu
                        right
                        customBurgerIcon={<Icons.Hamburger />}
                        customCrossIcon={<Icons.Closer />}
                        isOpen={menuOpen}
                        onStateChange={(ref) => handleStateChange(ref)}>
                        <a href="https://github.com/tellor-io/chorus" target="_blank" rel="noopener noreferrer">
                            <Icons.Github className="Github" fill="white" height="30px" width="30px" />
                        </a>
                        <a href="https://docs.tellor.io/chorus/" target="_blank" rel="noopener noreferrer">whitepaper</a>
                        <div onClick={() => handleClick("RefA")}><p>how does it work</p></div>
                        <div onClick={() => handleClick("RefB")}><p>contact</p></div>
                    </Menu>
                    <div className="LogoBox">
                        <p><a href="https://tellor.io" className="tellorLink" target="_blank" rel="noopener noreferrer">tellor </a>presents</p>
                        <Icons.Logo className="Logo" height="18px" width="18px" />
                        <p>CHORUS</p>
                    </div>
                    <div className="flexer"></div>
                </div>
                :
                <div className="Nav_inner">
                    <div className="LogoBox">
                        <p><a href="https://tellor.io" className="tellorLink" target="_blank" rel="noopener noreferrer">tellor </a>presents</p>
                        <Icons.Logo className="Logo" height="18px" width="18px" />
                        <p>CHORUS</p>
                    </div>
                    <div className="flexer"></div>
                    <div className="Menu_Total">
                        <a href="https://docs.tellor.io/chorus/" target="_blank" rel="noopener noreferrer">whitepaper</a>
                        <div onClick={props.onClickRefA}><p>how does it work</p></div>
                        <div onClick={props.onClickRefB}><p>contact</p></div>
                        <a href="https://github.com/tellor-io/chorus" target="_blank" rel="noopener noreferrer">
                            <Icons.Github className="Github" height="26px" width="26px" />
                        </a>
                    </div>
                </div>
            }
        </div>
    );
}

export default Nav;
