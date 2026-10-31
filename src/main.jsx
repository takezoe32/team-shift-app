import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppEntry from './components/AppEntry.jsx'
createRoot(document.getElementById('root')).render(
  <StrictMode><Suspense fallback={<div className="p-6">読込中…</div>}><AppEntry/></Suspense></StrictMode>,
)
