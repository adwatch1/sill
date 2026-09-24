import { app, BrowserWindow, globalShortcut, Menu, nativeImage, protocol, session, Tray } from 'electron'
import { join } from 'path'
import {
  allowPanelClose,
  createPanel,
  flushNotes,
  getPanelWindow,
  openPanel,
  openSettingsView,
  playIntro,
  positionWindow,
  setPanelSuppressed,
  togglePanel
} from './panel'
import { initLightbox } from './lightbox'
import { registerStorageIpc } from './storage'
import { registerMediaIpc, registerMediaProtocol } from './media'
import { registerYouTubeIpc } from './youtube'
import { flushSettings, getSettings, initSettings, updateSettings } from './settings'
import { formatShortcut } from '../shared/settings'

let tray: Tray | null = null

// Not içindeki görsellerin gösterilebilmesi için `sill://` adres şeması.
// ⚠️ Bu kayıt app hazır olmadan ÖNCE ve tek kopya kilidinin dışında yapılmalı;
// sonra yapılırsa sessizce çalışmaz.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sill',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: false, corsEnabled: false }
  }
])

// Sadece geliştirme: otomatik test betiklerinin panele bağlanabilmesi için debug kapısı.
// Paketlenmiş (son kullanıcı) sürümde asla açılmaz.
if (!app.isPackaged && process.env.SILL_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.SILL_DEBUG_PORT)
}

// Program zaten açıksa ikinci kopyayı açma, mevcut paneli göster.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => openPanel('shortcut'))

  app.whenReady().then(() => {
    lockDownPermissions()
    registerMediaProtocol()
    registerMediaIpc({
      // Dosya seçme penceresi panelden odağı alıyor; panel arkada kapanmasın.
      onDialogOpen: () => setPanelSuppressed(true),
      onDialogClose: () => setPanelSuppressed(false)
    })
    registerYouTubeIpc()
    // Büyütme penceresi açıkken panel kendiliğinden kapanmasın: odak ondan gidiyor.
    initLightbox({
      parent: getPanelWindow,
      onOpen: () => setPanelSuppressed(true),
      onClose: () => setPanelSuppressed(false)
    })
    registerStorageIpc()
    // Ayarlar panelden ÖNCE yüklenir: pencere genişliği ve tema ayara göre kurulsun.
    initSettings({
      onShortcut: togglePanel,
      onChange: () => {
        positionWindow() // genişlik değiştiyse pencereyi yeniden boyutlandır
        updateTrayMenu() // tepsi menüsündeki kısayol yazısı güncel kalsın
      }
    })
    createPanel()
    createTray()
    maybePlayIntro()
  })

  // Panel penceresi hiç kapanmıyor, sadece gizleniyor; program tepsiden "Çıkış" ile kapanır.
  app.on('window-all-closed', () => {})
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    flushSettings()
  })

  // Çıkarken: arayüzde bekleyen (henüz diske yazılmamış) değişiklik varsa önce onu kaydet.
  let flushed = false
  app.on('before-quit', (e) => {
    if (flushed) return
    e.preventDefault()
    flushNotes().finally(() => {
      flushed = true
      allowPanelClose()
      app.quit()
    })
  })
}

/**
 * Kurulumdan sonraki ilk açılışta panel kendini bir kez gösterir. Kurulum penceresi
 * "bitti" demeden kapandığı için kullanıcı programın nerede olduğunu böyle görüyor.
 * Sadece kurulu sürümde: geliştirmede çalışsa, testler kullanıcının tek seferlik
 * gösterimini tüketirdi (SILL_FORCE_INTRO ile elle açılabilir).
 */
function maybePlayIntro(): void {
  if (getSettings().introShown) return
  if (!app.isPackaged && !process.env.SILL_FORCE_INTRO) return
  updateSettings({ introShown: true }) // çökme olsa bile tekrarlamasın
  playIntro()
}

/**
 * Hiçbir web izni (konum, bildirim, kamera…) varsayılan olarak verilmez.
 * Tek istisna 'media': mikrofonla ses kaydı için, sadece kendi pencerelerimiz için.
 * Mikrofon ancak kullanıcı kayıt düğmesine basınca açılır.
 */
function lockDownPermissions(): void {
  const ours = (wc: Electron.WebContents | null): boolean =>
    wc !== null && BrowserWindow.fromWebContents(wc) !== null

  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'media' && ours(wc))
  })
  // getUserMedia tekrar çağrıldığında istek değil bu kontrol sorulur; ikisi de gerekli.
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && ours(wc))
}

function createTray(): void {
  // Kurulu programda ikon, programın "resources" klasöründe; geliştirmede proje klasöründe.
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(__dirname, '../../resources/tray.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon)
  tray.setToolTip('Sill')
  updateTrayMenu()
  tray.on('click', togglePanel)
}

function updateTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Paneli aç / kapat    (${formatShortcut(getSettings().shortcut)})`,
        click: togglePanel
      },
      { label: 'Ayarlar…', click: openSettingsView },
      { type: 'separator' },
      { label: 'Çıkış', click: () => app.quit() }
    ])
  )
}
