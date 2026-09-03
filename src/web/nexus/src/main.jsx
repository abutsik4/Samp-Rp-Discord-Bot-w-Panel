import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthGuard } from './lib/AuthGuard.jsx'
import { BotProvider } from './lib/BotContext.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('Nexus ErrorBoundary caught:', error, errorInfo)
    if (window.__nexus_errors) window.__nexus_errors.push({ error, errorInfo })
    else window.__nexus_errors = [{ error, errorInfo }]
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#f87171', fontFamily: 'monospace' }}>
          <h2 style={{ color: '#f87171' }}>Nexus crashed</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error?.toString?.()}
            {'\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<h1 style="color:red">ERROR: no #root</h1>'
} else {
  try {
    const root = ReactDOM.createRoot(rootEl)
    root.render(
      <React.StrictMode>
        <BrowserRouter basename="/nexus">
          <ErrorBoundary>
            <AuthGuard>
              <BotProvider>
                <App />
              </BotProvider>
            </AuthGuard>
          </ErrorBoundary>
        </BrowserRouter>
      </React.StrictMode>
    )
    window.__nexus_loaded = true
  } catch (err) {
    rootEl.innerHTML = '<pre style="color:red">React mount error: ' + err.message + '\n' + err.stack + '</pre>'
  }
}
