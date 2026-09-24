import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { NotesData, SaveResult } from '../shared/notes'
import type { Settings, SettingsResult } from '../shared/settings'
import type { ImportResult } from '../shared/media'
import type { YouTubePreview } from '../shared/youtube'

// Arayüzün (renderer) arka planla konuşabildiği tek kapı. Sadece burada tanımlı
// işlemler yapılabilir; arayüz doğrudan diske veya sisteme erişemez (güvenlik).

export interface ShowOptions {
  /** Kısayolla açıldıysa true → imleç doğrudan not alanına gitsin. */
  focusEditor: boolean
  /** Tepsideki "Ayarlar…" ile açıldıysa true → ayarlar ekranı açık gelsin. */
  openSettings: boolean
}

const panelApi = {
  onShow: (cb: (opts: ShowOptions) => void) => {
    const handler = (_e: unknown, opts: ShowOptions) => cb(opts)
    ipcRenderer.on('panel:show', handler)
    return () => {
      ipcRenderer.removeListener('panel:show', handler)
    }
  },
  /** Panel zaten açıkken tepsiden "Ayarlar…" seçildi. */
  onOpenSettings: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('panel:open-settings', handler)
    return () => {
      ipcRenderer.removeListener('panel:open-settings', handler)
    }
  },
  onHide: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('panel:hide', handler)
    return () => {
      ipcRenderer.removeListener('panel:hide', handler)
    }
  },
  /** Kapanış animasyonu bitti → pencere gizlenebilir. */
  hidden: () => ipcRenderer.send('panel:hidden'),
  /** Arayüzden kapatma isteği (ör. Esc). */
  requestClose: () => ipcRenderer.send('panel:request-close'),
  /** Odaktaki yazı alanında Windows düzenleme komutu çalıştır (sağ tık menüsü). */
  edit: (cmd: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll') => ipcRenderer.send('panel:edit', cmd),
  /** Ses kaydı başladı / bitti: kayıt sürerken panel kendiliğinden kapanmaz. */
  recording: (on: boolean) => ipcRenderer.send('panel:recording', on)
}

const notesApi = {
  /** Diskteki notları oku. Dosya yoksa null. */
  load: (): Promise<NotesData | null> => ipcRenderer.invoke('notes:load'),
  /** Notları güvenli şekilde diske yaz. */
  save: (data: NotesData): Promise<SaveResult> => ipcRenderer.invoke('notes:save', data),
  /** Program kapanmadan önce arka plan "bekleyen kaydı hemen yaz" der. */
  onFlushRequest: (cb: () => Promise<void>) => {
    const handler = async () => {
      try {
        await cb()
      } finally {
        ipcRenderer.send('notes:flushed')
      }
    }
    ipcRenderer.on('notes:flush', handler)
    return () => {
      ipcRenderer.removeListener('notes:flush', handler)
    }
  }
}

const settingsApi = {
  get: (): Promise<{ settings: Settings; isPackaged: boolean; isStore: boolean }> => ipcRenderer.invoke('settings:get'),
  /** Ayar(lar)ı değiştir; anında uygulanır ve kaydedilir. Sonuçta geçerli ayarlar döner. */
  set: (patch: Partial<Settings>): Promise<SettingsResult> => ipcRenderer.invoke('settings:set', patch),
  /** Kısayol kaydı başlarken/biterken (mevcut kısayol geçici bırakılır). */
  recording: (on: boolean) => ipcRenderer.send('settings:recording', on),
  openDataFolder: () => ipcRenderer.send('settings:open-data-folder'),
  /** Mağaza sürümü: Windows Ayarları → Başlangıç uygulamaları. */
  openStartupSettings: () => ipcRenderer.send('settings:open-startup-settings'),
  /** "Kahve ısmarla" bağış sayfası (adres arka planda sabit). */
  openSupport: () => ipcRenderer.send('app:open-support')
}

const mediaApi = {
  /**
   * Sürüklenip bırakılan dosyaların diskteki yolunu ver.
   * Electron 32'den beri `File.path` yok; yolu almanın tek yolu bu ve SADECE preload'da çalışıyor.
   */
  pathsFor: (files: File[]): string[] => files.map((f) => webUtils.getPathForFile(f)),
  /** Dosyaları not klasörüne al (kopyala + önizleme üret). Hata fırlatmaz, sonuç döner. */
  importPaths: (paths: string[]): Promise<ImportResult[]> =>
    ipcRenderer.invoke('media:import-paths', paths),
  /**
   * Yapıştırılan görselin baytlarını not klasörüne al. Ekran görüntüsünün diskte dosyası
   * olmadığı için yolu yok; tek yol baytları göndermek.
   */
  importBytes: (data: Uint8Array, name: string): Promise<ImportResult> =>
    ipcRenderer.invoke('media:import-bytes', data, name),
  /** "Görsel ekle…" / "Ses ekle…": dosya seçme penceresini aç, seçilenleri içeri al. */
  pick: (kind: 'image' | 'audio'): Promise<ImportResult[]> => ipcRenderer.invoke('media:pick', kind),
  /** İlk açılış: programla gelen örnek görselleri not klasörüne al. */
  importDemo: (): Promise<ImportResult[]> => ipcRenderer.invoke('media:import-demo'),
  /** Windows'un mikrofon gizlilik ayarını aç (mikrofon oradan kapatılmışsa). */
  openMicSettings: () => ipcRenderer.send('media:open-mic-settings'),
  /** YouTube kartının küçük resmini ve başlığını al (ayarda kapalıysa `disabled` döner). */
  youTubePreview: (videoId: string): Promise<YouTubePreview> => ipcRenderer.invoke('link:youtube-preview', videoId),
  /** Videoyu varsayılan tarayıcıda aç. */
  openYouTube: (videoId: string, start?: number) => ipcRenderer.send('link:open', { videoId, start }),
  /** Görseli ekranı kaplayan ayrı pencerede aç. */
  openLightbox: (att: string, ext: string, name?: string) =>
    ipcRenderer.send('lightbox:open', { att, ext, name })
}

export type MediaApi = typeof mediaApi

export type PanelApi = typeof panelApi
export type NotesApi = typeof notesApi
export type SettingsApi = typeof settingsApi

contextBridge.exposeInMainWorld('panel', panelApi)
contextBridge.exposeInMainWorld('notes', notesApi)
contextBridge.exposeInMainWorld('settings', settingsApi)
contextBridge.exposeInMainWorld('media', mediaApi)
