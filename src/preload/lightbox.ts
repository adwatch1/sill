import { contextBridge, ipcRenderer } from 'electron'

// Büyütme penceresinin köprüsü — panelinkinden AYRI ve bilerek çok dar.
// Burada `notes.save` gibi bir şey olsaydı, hiçbir işe yaramadan duran dolu bir silah olurdu.

export interface LightboxItem {
  src: string
  name?: string
}

const lightboxApi = {
  onShow: (cb: (item: LightboxItem) => void) => {
    const handler = (_e: unknown, item: LightboxItem): void => cb(item)
    ipcRenderer.on('lightbox:show', handler)
    return () => {
      ipcRenderer.removeListener('lightbox:show', handler)
    }
  },
  /** Arayüz kuruldu: arka plan görseli göndersin ve pencereyi göstersin. */
  ready: () => ipcRenderer.send('lightbox:ready'),
  close: () => ipcRenderer.send('lightbox:close')
}

export type LightboxApi = typeof lightboxApi

contextBridge.exposeInMainWorld('lightbox', lightboxApi)
