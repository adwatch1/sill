import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Panel } from './components/Panel'
import { NotesProvider } from './store/notesStore'
import { FOCUS_EDITOR_EVENT } from './components/NoteView'
import type { Settings } from '../../shared/settings'
import { setLanguagePref } from './i18n'

export function App() {
  const [visible, setVisible] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsOpenRef = useRef(false)
  settingsOpenRef.current = settingsOpen
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    window.settings.get().then((r) => {
      setLanguagePref(r.settings.language)
      setSettings(r.settings)
      panelWidthRef.current = r.settings.panelWidth
    })
  }, [])

  // ── Kenarlardan sürükleyerek boyutlandırma ────────────────────
  // Panel genişliği bilerek React durumunda TUTULMUYOR. Sebebi:
  // panel genişleyince pencere de büyümeli, ama pencere arka planda bir an sonra
  // büyüyor. Arayüz her karede yeniden çizilirse animasyon kütüphanesi "çizim anındaki"
  // ile "pencere büyüdükten sonraki" konum arasındaki farkı kayma sanıp her seferinde
  // minik bir sapma bırakıyor; sürükleme boyunca birikip tab'ları yüzlerce piksel
  // kaydırıyordu (ölçüldü). Panel zaten pencereyi takip ettiği için yeniden çizim
  // gereksiz: değeri ref'te tutup sadece arka plana gönderiyoruz.
  const panelWidthRef = useRef(0)
  const pending = useRef<number | null>(null)
  const raf = useRef(0)

  const setPanelWidth = useCallback((width: number) => {
    panelWidthRef.current = width
    pending.current = width
    if (raf.current) return
    // Fare her kıpırdadığında değil, ekran karesi başına bir kez gönder.
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const w = pending.current
      pending.current = null
      if (w !== null) window.settings.set({ panelWidth: w })
    })
  }, [])

  /** Sürükleme bitti: kalıcı değeri arka plandan tazele. */
  const commitPanelWidth = useCallback(() => {
    window.settings.get().then((r) => {
      panelWidthRef.current = r.settings.panelWidth
      setSettings(r.settings)
    })
  }, [])

  // Sütun genişliği CSS değişkeniyle çiziliyor, yani durumda kalmalı — ama pencereyi
  // değiştirmediği için yukarıdaki sorun burada yok.
  const setSubtabWidth = useCallback((subtabWidth: number) => {
    setSettings((s) => (s ? { ...s, subtabWidth } : s))
    window.settings.set({ subtabWidth })
  }, [])

  const togglePin = async (): Promise<void> => {
    const r = await window.settings.set({ pinned: !(settings?.pinned ?? false) })
    setSettings(r.settings)
  }

  // Ayarlar kapanınca kalıcı ayarları arka plandan tazele (ör. kısayol, tema değişmiş olabilir).
  const changeSettingsOpen = (open: boolean): void => {
    setSettingsOpen(open)
    if (!open) commitPanelWidth()
  }

  useEffect(() => {
    const offShow = window.panel.onShow(({ focusEditor, openSettings }) => {
      setVisible(true)
      setSettingsOpen(openSettings)
      // Kısayolla açıldıysa, panel çizildikten sonra imleci not alanına götür.
      if (focusEditor) setTimeout(() => window.dispatchEvent(new Event(FOCUS_EDITOR_EVENT)), 60)
    })
    const offHide = window.panel.onHide(() => setVisible(false))
    const offSettings = window.panel.onOpenSettings(() => setSettingsOpen(true))
    // Esc: ayarlar açıksa önce ayarları kapat (geri git), değilse paneli kapat.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (settingsOpenRef.current) setSettingsOpen(false)
      else window.panel.requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offShow()
      offHide()
      offSettings()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Kapanış animasyonu bitince arka plana "artık gizleyebilirsin" de.
  return (
    <NotesProvider>
      <AnimatePresence onExitComplete={() => window.panel.hidden()}>
        {visible && settings && (
          <Panel
            key="panel"
            settingsOpen={settingsOpen}
            onSettingsOpenChange={changeSettingsOpen}
            pinned={settings.pinned}
            onTogglePin={togglePin}
            getPanelWidth={() => panelWidthRef.current}
            onPanelWidth={setPanelWidth}
            onPanelWidthCommit={commitPanelWidth}
            subtabWidth={settings.subtabWidth}
            onSubtabWidth={setSubtabWidth}
          />
        )}
      </AnimatePresence>
    </NotesProvider>
  )
}
