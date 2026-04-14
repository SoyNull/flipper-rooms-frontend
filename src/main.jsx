import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { baseSepolia } from 'viem/chains'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#ff3366', background: '#0a0a1a', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#fff', marginBottom: 16 }}>FlipperRooms crashed</h1>
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
          defaultChain: baseSepolia,
          supportedChains: [baseSepolia],
          embeddedWallets: {
            createOnLogin: 'users-without-wallets',
            requireUserPasswordOnCreate: false,
            showWalletUIs: false,
          },
          loginMethods: ['wallet', 'email', 'google'],
        }}
      >
        <App />
      </PrivyProvider>
    </ErrorBoundary>
  </StrictMode>,
)
