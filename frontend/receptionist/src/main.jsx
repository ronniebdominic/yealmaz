import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { installResponsiveTables } from './utils/responsiveTables'
import { installInfoTooltips } from './utils/infoTooltips'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Captions for the phone card layout's table cells (see utils/responsiveTables.js)
installResponsiveTables();

// Viewport-safe KPI info tooltips (see utils/infoTooltips.js)
installInfoTooltips();
