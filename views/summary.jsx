import React from 'react';

export default React.createClass({
  displayName: 'Summary',

  render() {
    return (
      <div classname="results">
        { this.props.messages }
      </div>
    );
  }
})
