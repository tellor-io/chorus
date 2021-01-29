import React from 'react';
import './App.scss';
import Nav from './components/Nav/Nav';
import Header from './components/Header/Header';
import KeyElements from './components/KeyElements/KeyElements';
import Steps from './components/Steps/Steps';
import Footer from './components/Footer/Footer';


class App extends React.Component {
  refA = React.createRef()
  refB = React.createRef()
  
  componentDidMount() {
    this.setState({ loaded: true })
  }
  
  handleScrollTo = (elRef) => {
    // Incase the ref supplied isn't ref.current
    const el = elRef.current ? elRef.current : elRef
    // Scroll the element into view
    el.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }
  
  render() {
  return (
    <div className="App">
      <Nav
        onClickRefA={() => { this.handleScrollTo(this.refA) }}
        onClickRefB={() => { this.handleScrollTo(this.refB) }}
         />
      <Header />
      <div ref={this.refA}></div>
      <KeyElements />
      <Steps />
      <div ref={this.refB}></div>
      <Footer />
    </div>
  );
  }
}


export default App;
