import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { base } from 'viem/chains'
import App from './App.jsx'

// Suppress wallet extension conflicts (OKX + MetaMask etc.)
try {
  if (window.ethereum && Object.getOwnPropertyDescriptor(window, 'ethereum')?.configurable === false) {
    // Property already locked by another extension, ignore
  }
} catch (e) {
  console.warn("Wallet extension conflict detected:", e.message);
}

// Stale-chunk auto-retry. After a deploy, users with an open tab hold
// an index.html that references old bundle hashes; those chunk files
// no longer exist on Vercel, so dynamic imports reject with a "Failed
// to fetch" error and React never mounts — user sees the initial
// loader spin forever. Detect that exact class of error and force a
// single reload, which pulls the fresh index.html + current hashes.
// Guarded by sessionStorage so a genuinely broken deploy can't trap
// the page in a reload loop.
const RELOAD_FLAG = 'fnf_chunk_reload';
const isChunkError = (msg) =>
  /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg || '');
const tryReloadOnce = (msg) => {
  if (!isChunkError(msg)) return;
  if (sessionStorage.getItem(RELOAD_FLAG)) return; // already retried
  sessionStorage.setItem(RELOAD_FLAG, '1');
  location.reload();
};
window.addEventListener('error', (e) => tryReloadOnce(e.message));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  tryReloadOnce(r?.message || (typeof r === 'string' ? r : ''));
});
// Clear the flag a few seconds after a successful boot so the next
// deploy-drift gets its own single retry attempt.
setTimeout(() => { try { sessionStorage.removeItem(RELOAD_FLAG); } catch {} }, 8000);

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#ff3366', background: '#0a0a1a', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#fff', marginBottom: 16 }}>Flip N Flop crashed</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#ff6688' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#666', marginTop: 12 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <PrivyProvider
        appId="cmnxt943e02zx0cjx4ls0ew7l"
        config={{
          appearance: {
            theme: 'dark',
            accentColor: '#00ffa3',
          },
          defaultChain: base,
          supportedChains: [base],
          embeddedWallets: {
            createOnLogin: 'users-without-wallets',
            requireUserPasswordOnCreate: false,
            showWalletUIs: false,
          },
          loginMethods: ['email', 'google', 'wallet'],
        }}
      >
        <App />
      </PrivyProvider>
    </ErrorBoundary>
  </StrictMode>,
)
