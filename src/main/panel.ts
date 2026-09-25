import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import {
  PANEL,
  TRIGGER_EDGE_PX,
  CLOSE_DELAY_MS,
  POLL_MS,
  EXIT_FALLBACK_MS,
  INTRO_DELAY_MS,
  INTRO_HOLD_MS,
  FULLSCREEN_POLL_MS,
  FULLSCREEN_EXIT_MS
} from './config'
import { getSettings, setShortcutSuspended } from './settings'
import { foregroundState } from './fullscreen'
import { closeLightbox, isLightboxOpen } from './lightbox'
import { alive } from './util'

// Panelin durumu:
//  hidden  → pencere gizli, gözcü tetik bölgesini izliyor
//  open    → panel görünür (açılış animasyonu dahil)
//  closing → kapanış animasyonu oynuyor, bitince pencere gizlenecek
type PanelState = 'hidden' | 'open' | 'closing'
type OpenSource = 'hover' | 'shortcut' | 'settings'

let win: BrowserWindow | null = null
let state: PanelState = 'hidden'
let dwellStart: number | null = null
let leftAt: number | null = null
// Panel kapandıktan sonra, mouse tetik bölgesinden bir kez çıkmadan tekrar açılmasın.
// (Yoksa Esc ile kapatınca mouse hâlâ kenardaysa anında geri açılır.)
let armed = true
let exitFallback: NodeJS.Timeout | null = null
// Pencere sadece program gerçekten kapanırken kapanabilir; Alt+F4 vb. sadece paneli gizler.
let allowClose = false
let watcher: NodeJS.Timeout | null = null
// Panelin kendiliğinden kapanmasını geçici olarak durduran sayaç. Büyütme penceresi,
// ses kaydı ve dosya seçici panelin odağını alır; o sırada panel kapanmamalı.
// Sayaç, çünkü birden fazla iş aynı anda açık olabilir.
let suppress = 0

/** Kendiliğinden kapanmayı durdur / serbest bırak. Her `true` için bir `false` gelmeli. */
export function setPanelSuppressed(on: boolean): void {
  suppress = Math.max(0, suppress + (on ? 1 : -1))
}

// Kayıt, sayaca tek bir "tutma" olarak girer: arayüz "başladı"yı iki kez derse sayaç şişmesin.
let recordingHold = false
function setRecordingHold(on: boolean): void {
  if (on === recordingHold) return
  recordingHold = on
  setPanelSuppressed(on)
}

// ── Duraklatma ──
// İki sebep: önde tam ekran bir program (oyun, tam ekran video) ya da tepsiden elle "Duraklat".
// Duraklatılınca her şey durur: kenar tetiği çalışmaz, kısayol Windows'a bırakılır (tuşlar oyuna
// gitsin), açık panel kapanır — raptiye takılı olsa bile. Tepsiden açmak yine mümkün.
let manualPause = false
let fullscreenActive = false
let normalSince: number | null = null
let paused = false
let fullscreenWatcher: NodeJS.Timeout | null = null
let onPauseChange: (paused: boolean) => void = () => {}

export const isPaused = (): boolean => paused
export const isManualPause = (): boolean => manualPause

export function setManualPause(on: boolean): void {
  manualPause = on
  refreshPause()
}

/** Duraklatma durumunu yeniden hesapla (ayar değişince de çağrılır). */
export function refreshPause(): void {
  const next = manualPause || (fullscreenActive && getSettings().pauseInFullscreen)
  if (next === paused) return
  paused = next
  setShortcutSuspended(paused)
  if (paused) {
    dwellStart = null
    closePanel()
  }
  onPauseChange(paused)
}

// Tam ekrana GİRİŞ hemen algılanır (oyun açılır açılmaz kenar sussun). ÇIKIŞ için kısa bir
// süre "normal" kalması beklenir: oyunlar yüklenirken ya da Alt+Tab sırasında bir an
// pencere küçülüp büyüyebiliyor, panel o arada gidip gelmesin.
function watchFullscreen(): void {
  if (!getSettings().pauseInFullscreen) {
    fullscreenActive = false
    normalSince = null
    refreshPause()
    return
  }
  const st = foregroundState()
  if (st === 'own') return // öndeki bizim penceremiz: karar değişmez
  if (st === 'fullscreen') {
    fullscreenActive = true
    normalSince = null
  } else if (fullscreenActive) {
    normalSince ??= Date.now()
    if (Date.now() - normalSince >= FULLSCREEN_EXIT_MS) fullscreenActive = false
  }
  refreshPause()
}

/** Panel şu an kendiliğinden kapanabilir mi? (raptiye veya bastırma varsa hayır) */
const autoCloseBlocked = (): boolean => suppress > 0 || getSettings().pinned


/** Büyütme penceresinin "üstünde duracağı" pencere. */
export const getPanelWindow = (): BrowserWindow | null => (alive(win) ? win : null)

export function allowPanelClose(): void {
  allowClose = true
  closeLightbox() // ikinci pencere de yok edilmeli, yoksa çıkışta takılırız
  // Program kapanıyor: gözcüyü ve ekran dinleyicilerini durdur ki yok edilen pencereye dokunmasınlar.
  if (watcher) clearInterval(watcher)
  watcher = null
  if (fullscreenWatcher) clearInterval(fullscreenWatcher)
  fullscreenWatcher = null
  screen.removeListener('display-metrics-changed', positionWindow)
  screen.removeListener('display-added', positionWindow)
  screen.removeListener('display-removed', positionWindow)
}

export function createPanel(opts: { onPauseChange: (paused: boolean) => void }): BrowserWindow {
  onPauseChange = opts.onPauseChange
  win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    type: 'toolbar', // Alt+Tab listesinde görünmesin
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // gizliyken bile animasyon mesajlarına anında cevap versin
      spellcheck: false // Türkçe sözlük Google'dan iner; tamamen yerel kalmak için kapalı
    }
  })

  win.setAlwaysOnTop(true, 'pop-up-menu')
  positionWindow()

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('close', (e) => {
    if (allowClose) return
    e.preventDefault()
    closePanel()
  })

  // Panele tıklanıp sonra dışarı tıklanırsa (odak kaybı) kapan — raptiye takılı değilse.
  // Raptiye takılıysa kapanmaz ama tıklanan pencere öne geçip paneli örtebilir; geri öne al.
  // (Büyütme penceresi / dosya seçici açıkken değil: panel onların üstüne çıkmamalı.)
  win.on('blur', () => {
    if (!autoCloseBlocked()) closePanel()
    else if (suppress === 0 && !isLightboxOpen()) setImmediate(bringToFront)
  })

  // Pencere ASLA başka bir adrese gitmez. Yoksa panele bir dosya sürüklenip bırakıldığında
  // arayüz o dosyaya gidiyor ve kaydedilmemiş yazı uçuyor (yaşanabilir bir hataydı).
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Not alanındaki sağ tık menüsü: Windows'un kendi düzenleme komutları (sadece bu liste).
  const EDIT_COMMANDS = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'] as const
  ipcMain.on('panel:edit', (e, cmd: unknown) => {
    if (EDIT_COMMANDS.includes(cmd as (typeof EDIT_COMMANDS)[number])) {
      e.sender[cmd as (typeof EDIT_COMMANDS)[number]]()
    }
  })

  ipcMain.on('panel:hidden', finishHide)
  ipcMain.on('panel:request-close', () => closePanel())

  // Ses kaydı sürerken panel kendiliğinden kapanmasın. Arayüz çökerse ya da yeniden yüklenirse
  // "kayıt bitti" haberi hiç gelmez; o zaman da bırakıyoruz ki sayaç sonsuza kadar asılı kalmasın.
  ipcMain.on('panel:recording', (_e, on: unknown) => setRecordingHold(on === true))
  win.webContents.on('render-process-gone', () => setRecordingHold(false))
  win.webContents.on('did-start-loading', () => setRecordingHold(false))

  screen.on('display-metrics-changed', positionWindow)
  screen.on('display-added', positionWindow)
  screen.on('display-removed', positionWindow)

  watcher = setInterval(watchCursor, POLL_MS)
  fullscreenWatcher = setInterval(watchFullscreen, FULLSCREEN_POLL_MS)
  return win
}

// Pencereyi birincil monitörün sağ kenarına, dikeyde ortalı yerleştir.
export function positionWindow(): void {
  if (!alive(win)) return
  const area = screen.getPrimaryDisplay().workArea // görev çubuğu hariç alan
  const panelHeight = Math.round(area.height * PANEL.heightRatio)
  const width = PANEL.padShadow + getSettings().panelWidth + PANEL.padEdge
  const height = panelHeight + PANEL.padShadow * 2
  win.setBounds({
    x: area.x + area.width - width,
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height
  })
}

export function openPanel(source: OpenSource): void {
  if (!alive(win) || state === 'open') return
  clearExitFallback()
  positionWindow()
  state = 'open'
  leftAt = null
  if (source !== 'hover') {
    // Kısayolla / Ayarlar'dan açınca hemen kullanabilelim diye odağı al.
    win.show()
    win.focus()
  } else {
    // Mouse ile açınca odağı çalma: alttaki program aktif kalsın, panele tıklayınca odak gelir.
    win.showInactive()
  }
  bringToFront()
  win.webContents.send('panel:show', {
    focusEditor: source === 'shortcut',
    openSettings: source === 'settings'
  })
}

function closePanel(): void {
  // Panel kapanıyorsa büyütme penceresi ekranda asılı kalmamalı.
  closeLightbox()
  if (!alive(win) || state !== 'open') return
  state = 'closing'
  armed = false
  win.webContents.send('panel:hide')
  // Arayüz "animasyon bitti" demezse (ör. takıldıysa) yine de gizle.
  exitFallback = setTimeout(finishHide, EXIT_FALLBACK_MS)
}

/** Arayüzden bekleyen kaydı hemen yazmasını iste (program kapanmadan önce). En fazla 1,5 sn bekler. */
export function flushNotes(): Promise<void> {
  const w = win
  if (!w || w.isDestroyed()) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      ipcMain.removeListener('notes:flushed', done)
      resolve()
    }
    const timer = setTimeout(done, 1500)
    ipcMain.once('notes:flushed', done)
    w.webContents.send('notes:flush')
  })
}

/** Tepsideki "Ayarlar…": panel kapalıysa ayarlar açık şekilde aç, açıksa ayarlara geç. */
export function openSettingsView(): void {
  if (!alive(win)) return
  if (state === 'open') {
    win.show()
    win.focus()
    win.webContents.send('panel:open-settings')
  } else {
    openPanel('settings')
  }
}

/**
 * Kurulumdan sonraki ilk açılış: panel sağdan kayıp gelir, birkaç saniye durur, geri çekilir.
 * Odağı çalmaz (kullanıcı ne yapıyorsa devam etsin). Gözcü bu sırada paneli kapatmasın diye
 * bastırma sayacı kullanılır — fare kenarda olmadığı için normalde 400 ms sonra kapanırdı.
 */
export function playIntro(): void {
  setTimeout(() => {
    if (!alive(win)) return
    setPanelSuppressed(true)
    openPanel('hover')
    setTimeout(() => {
      setPanelSuppressed(false)
      // Kullanıcı bu arada panele tıkladıysa elinden alma; kendi kapatsın.
      if (alive(win) && !win.isFocused()) closePanel()
    }, INTRO_HOLD_MS)
  }, INTRO_DELAY_MS)
}

export function togglePanel(): void {
  // Katman mantığı: önce büyütme penceresi kapanır, panel açık kalır.
  if (isLightboxOpen()) {
    closeLightbox()
    return
  }
  if (state === 'open') closePanel()
  else openPanel('shortcut')
}

/**
 * Paneli bütün pencerelerin önüne al. Windows "her zaman üstte" bayrağını gizle/göster
 * sırasında ya da başka bir program kendini öne attığında sessizce kaybedebiliyor; panel
 * açılınca başka pencerelerin ARKASINDA kalabiliyordu. Bayrağı
 * kapatıp yeniden açmak Windows'u onu tekrar uygulamaya zorlar. Odağı çalmaz.
 */
function bringToFront(): void {
  if (!alive(win) || !win.isVisible()) return
  win.setAlwaysOnTop(false)
  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.moveTop()
}

function finishHide(): void {
  clearExitFallback()
  if (!alive(win) || state !== 'closing') return
  win.hide()
  state = 'hidden'
}

function clearExitFallback(): void {
  if (exitFallback) clearTimeout(exitFallback)
  exitFallback = null
}

function watchCursor(): void {
  if (!alive(win)) return
  const p = screen.getCursorScreenPoint()
  const now = Date.now()

  if (state === 'hidden' || state === 'closing') {
    if (paused) {
      dwellStart = null
      return
    }
    const d = screen.getPrimaryDisplay().bounds
    const { triggerZone, dwellMs } = getSettings()
    const inZone =
      p.x >= d.x + d.width - TRIGGER_EDGE_PX &&
      p.x <= d.x + d.width &&
      p.y >= d.y + (d.height * (1 - triggerZone)) / 2 &&
      p.y <= d.y + (d.height * (1 + triggerZone)) / 2

    if (!inZone) {
      armed = true
      dwellStart = null
      return
    }
    if (!armed) return
    dwellStart ??= now
    if (now - dwellStart >= dwellMs) {
      dwellStart = null
      openPanel('hover')
    }
    return
  }

  // Panel açık. Kullanıcı panele tıkladıysa (odak panelde) mouse'la kapanmaz;
  // dışarı tıklayınca, Esc veya kısayolla kapanır. Sadece "göz atma" modunda mouse çıkınca kapanır.
  // Raptiye takılıysa ya da bastırma varsa (büyütme / kayıt / dosya seçici) kendiliğinden kapanmaz.
  if (win.isFocused() || autoCloseBlocked()) {
    leftAt = null
    return
  }
  const b = win.getBounds()
  const inside = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height
  if (inside) {
    leftAt = null
  } else {
    leftAt ??= now
    if (now - leftAt >= CLOSE_DELAY_MS) closePanel()
  }
}
