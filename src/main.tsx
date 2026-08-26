import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// registers the (deliberately trivial — see public/sw.js) service worker so Chrome/Android
// treats the site as a real installable PWA. BASE_URL (not a hardcoded path) so this keeps
// working whether the app is served from the domain root (dev) or /FinanceVisual/ (production).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
