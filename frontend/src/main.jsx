import React from 'react';
import ReactDOM from 'react-dom/client';
import { selection } from 'd3-selection';
import * as d3Transition from 'd3-transition';
import App from './App';
import './index.css';

// Explicitly bind all D3 transition & interrupt methods onto Selection prototype
if (selection && selection.prototype) {
  Object.assign(selection.prototype, d3Transition);
  if (!selection.prototype.interrupt) {
    selection.prototype.interrupt = function (name) {
      return this.each(function () {
        if (typeof this.__transition !== 'undefined') {
          delete this.__transition;
        }
      });
    };
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
