import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import AppRoot from './AppRoot'
import './styles.css'
import './enhancements.css'
import './sceneRules.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppRoot/>
    </HashRouter>
  </StrictMode>,
)
