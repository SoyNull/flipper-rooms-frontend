import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { baseSepolia } from 'viem/chains'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrivyProvider
      appId="cmnxt943e02zx0cjx4ls0ew7l"
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#00e87b',
          logo: null,
        },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        loginMethods: ['wallet', 'email'],
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>,
)
