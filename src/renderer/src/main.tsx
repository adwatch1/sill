import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles/tokens.css'
import { App } from './App'
import { installDevPanelStub } from './devPanelStub'

if (import.meta.env.DEV) installDevPanelStub()

// Panele bir dosya sürüklenip bırakılırsa tarayıcı motoru onu açmaya çalışır ve arayüz
// o dosyayla değişir (kaydedilmemiş yazı uçar). Kök seviyede engelliyoruz; not alanı
// kendi "bırak" işini üstlenirken bu engeli stopPropagation ile aşacak.
const blockFileDrop = (e: DragEvent): void => e.preventDefault()
window.addEventListener('dragover', blockFileDrop)
window.addEventListener('drop', blockFileDrop)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
