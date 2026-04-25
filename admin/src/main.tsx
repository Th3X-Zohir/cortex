import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LandingPage } from './pages/LandingPage'
import { PublicDocsPage } from './pages/PublicDocsPage'
import './index.css'

const p = window.location.pathname
const Root = p === '/' || p === '' ? LandingPage
  : p.startsWith('/docs') ? PublicDocsPage
  : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
