import React from 'react';
import { Button } from 'antd';
import './ChorusButton.scss';

const ChorusButton = (props) => {
  return (
      <Button className="ChorusButton" size="large">
        {props.txt}
        <svg xmlns="http://www.w3.org/2000/svg" width="186" height="3" viewBox="0 0 186 3">
            <path id="Path_126" data-name="Path 126" d="M0,0H186" transform="translate(0 1.5)" fill="none" stroke="#000" strokeWidth="3"/>
        </svg>
      </Button>
  );
}

export default ChorusButton;