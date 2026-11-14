import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EXPECTED_MODEL_VERSION } from './config';
import { AppStateProvider } from './state/AppStateProvider';
import { App } from './ui/App';
import './ui/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStateProvider modelVersion={EXPECTED_MODEL_VERSION}>
      <App />
    </AppStateProvider>
  </StrictMode>,
);
