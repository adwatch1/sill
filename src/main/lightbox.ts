import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { attUrl, isHash, isImageExt } from '../shared/media'
import { alive } from './util'
import { currentLang } from './i18n'

// Görseli büyütmek için ekranı kaplayan ikinci pencere (macOS'taki Quick Look gibi).
// Panel penceresi ~516 px genişliğinde; büyütülmüş görsel oraya sığmaz, bu yüzden ayrı pencere.
//
// ⚠️ Ekranı kaplayan, her zaman üstte duran bir pencerenin kapanmaması makineyi kullanılamaz
// hâle getirir. Bu yüzden DÖRT bağımsız kapanma yolu var: Esc (arayüz), Esc (burada, arayüz
// hiç yüklenmese bile), X düğmesi / arka plana tıklama, ve pencere odağını kaybetmek.
// Üstüne bir de "3 sn içinde açılmazsa kendini yok et" zaman aşımı.

const READY_TIMEOUT_MS = 3000

interface LightboxDeps {
  /** Panel penceresi — büyütme onun üstünde durur. */
  parent: () => BrowserWindow | null
  /** Açılınca / kapanınca panelin kendiliğinden kapanmasını durdur ve serbest bırak. */
  onOpen: () => void
  onClose: () => void
}

let deps: LightboxDeps | null = null
let win: BrowserWindow | null = null
let watchdog: NodeJS.Timeout | null = null

export const isLightboxOpen = (): boolean => alive(win)

export function closeLightbox(): void {
  if (alive(win)) win.destroy() // 'closed' olayı temizliği yapar
}

function clearWatchdog(): void {
  if (watchdog) clearTimeout(watchdog)
  watchdog = null
}

function open(src: string, name: string | undefined): void {
  if (!deps) return
  closeLightbox() // aynı anda tek büyütme penceresi

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const b = display.bounds // workArea değil: görev çubuğunun da üstünü kaplasın

  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
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
    type: 'toolbar',
    // parent: panelin üstünde kalsın. modal DEĞİL — modal olsaydı panel kullanılamaz hâle gelirdi.
    parent: deps.parent() ?? undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/lightbox.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver') // panel 'pop-up-menu' seviyesinde, bu onun üstünde

  const target = win
  // Sigorta: arayüz hiç yüklenmese ya da çökse bile Esc pencereyi kapatır.
  target.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') closeLightbox()
  })
  target.on('blur', () => closeLightbox())
  target.on('closed', () => {
    clearWatchdog()
    win = null
    deps?.onClose()
  })

  deps.onOpen()

  // Arayüz "hazırım" demezse ekranda siyah bir dikdörtgen asılı kalmasın.
  clearWatchdog()
  watchdog = setTimeout(() => {
    console.error('Büyütme penceresi açılamadı, kapatılıyor.')
    closeLightbox()
  }, READY_TIMEOUT_MS)

  const payload = { src, name, lang: currentLang() }
  ipcMain.once('lightbox:ready', () => {
    clearWatchdog()
    if (!alive(target)) return
    target.webContents.send('lightbox:show', payload)
    target.show()
    // Windows pencereyi oluştururken görev çubuğunun üstünü kapatmıyor (çalışma alanına kırpıyor).
    // Gösterdikten sonra boyutu yeniden vermek kırpmayı kaldırıyor — Quick Look gibi her şeyin üstü.
    target.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    target.loadURL(`${process.env.ELECTRON_RENDERER_URL}/lightbox.html`)
  } else {
    target.loadFile(join(__dirname, '../renderer/lightbox.html'))
  }
}

export function initLightbox(d: LightboxDeps): void {
  deps = d

  ipcMain.on('lightbox:open', (_e, p: unknown) => {
    if (typeof p !== 'object' || p === null) return
    const { att, ext, name } = p as { att?: unknown; ext?: unknown; name?: unknown }
    // Arayüzden gelen her şey doğrulanır: adres burada kurulur, oradan gelmez.
    if (typeof att !== 'string' || !isHash(att)) return
    if (typeof ext !== 'string' || !isImageExt(ext)) return
    open(attUrl(att, ext), typeof name === 'string' ? name : undefined)
  })

  ipcMain.on('lightbox:close', () => closeLightbox())
}
