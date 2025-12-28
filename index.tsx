
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

console.log("VibeSpace: Starting initialization...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("VibeSpace: React Render triggered.");
} catch (e) {
  console.error("VibeSpace: Render crash!", e);
}
