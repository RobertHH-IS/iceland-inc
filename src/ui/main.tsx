/**
 * Browser entry: mount the interface. `bun run dev` serves index.html (which loads this file);
 * `bun run build` bundles both into dist/ as a static site that works from any sub-path.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { startAnalytics } from './analytics.ts';

startAnalytics();

const root = document.getElementById('root');
if (!root) throw new Error('index.html needs a #root element');
root.textContent = '';
createRoot(root).render(
  <StrictMode>
    <App initialHash={window.location.hash} />
  </StrictMode>,
);
