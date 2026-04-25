import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { PublicDocsPage } from './pages/PublicDocsPage'
import './index.css'

const Root = window.location.pathname.startsWith('/docs') ? PublicDocsPage : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
