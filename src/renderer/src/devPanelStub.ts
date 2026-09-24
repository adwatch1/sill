// Sadece geliştirme: arayüz Electron dışında, düz tarayıcıda (http://localhost:5173) açılınca
// arka plan köprüsü yoktur. Bu sahte köprü paneli hemen gösterir ve notları tarayıcı hafızasında
// tutar ki tasarım tarayıcıda denenebilsin.
import type { MediaApi, NotesApi, PanelApi, SettingsApi } from '../../preload'
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../shared/settings'

export function installDevPanelStub(): void {
  if (window.panel) return
  const showListeners = new Set<Parameters<PanelApi['onShow']>[0]>()
  const hideListeners = new Set<() => void>()

  const panel: PanelApi = {
    onShow: (cb) => {
      showListeners.add(cb)
      setTimeout(() => cb({ focusEditor: false, openSettings: false }), 50)
      return () => void showListeners.delete(cb)
    },
    onHide: (cb) => {
      hideListeners.add(cb)
      return () => void hideListeners.delete(cb)
    },
    onOpenSettings: () => () => {},
    hidden: () =>
      setTimeout(() => showListeners.forEach((cb) => cb({ focusEditor: false, openSettings: false })), 400),
    requestClose: () => hideListeners.forEach((cb) => cb()),
    edit: (cmd) => void document.execCommand(cmd === 'selectAll' ? 'selectAll' : cmd),
    recording: () => {}
  }

  const KEY = 'sill-dev-data'
  const notes: NotesApi = {
    load: async () => {
      try {
        return JSON.parse(localStorage.getItem(KEY) ?? 'null')
      } catch {
        return null
      }
    },
    save: async (data) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data))
      } catch {
        // tarayıcı hafızası kapalıysa sessizce geç
      }
      return { ok: true }
    },
    onFlushRequest: () => () => {}
  }

  let current = { ...DEFAULT_SETTINGS }
  const settings: SettingsApi = {
    get: async () => ({ settings: current, isPackaged: false, isStore: false }),
    set: async (patch) => {
      current = sanitizeSettings({ ...current, ...patch })
      return { ok: true, settings: current }
    },
    recording: () => {},
    openDataFolder: () => {},
    openStartupSettings: () => {},
    openSupport: () => {}
  }

  // Tarayıcıda gerçek dosya sistemi yok: sürükle-bırak sessizce hiçbir şey yapmaz.
  const media: MediaApi = {
    pathsFor: () => [],
    importPaths: async () => [{ ok: false, message: 'Tarayıcıda görsel eklenemez.' }],
    importBytes: async () => ({ ok: false, message: 'Tarayıcıda görsel eklenemez.' }),
    pick: async () => [{ ok: false, message: 'Tarayıcıda görsel eklenemez.' }],
    openMicSettings: () => {},
    importDemo: async () => [],
    youTubePreview: async () => ({ ok: false, reason: 'offline' }),
    openYouTube: () => {},
    openLightbox: () => {}
  }

  window.media = media
  window.panel = panel
  window.notes = notes
  window.settings = settings
}
