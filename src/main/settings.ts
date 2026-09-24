import { app, globalShortcut, ipcMain, nativeTheme, shell } from 'electron'
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_SETTINGS,
  sanitizeSettings,
  type Settings,
  type SettingsResult
} from '../shared/settings'
import { SUPPORT_URL } from '../shared/app'
import { IS_STORE } from './config'
import { mt } from './i18n'

// Ayarlar: %APPDATA%\Sill\settings.json. Notlardan ayrı; bozulursa varsayılana dönülür.
const settingsPath = () => join(app.getPath('userData'), 'settings.json')

let current: Settings = { ...DEFAULT_SETTINGS }
let registeredShortcut: string | null = null
let onShortcut: () => void = () => {}
let onChange: (s: Settings) => void = () => {}
let saveTimer: NodeJS.Timeout | null = null

export const getSettings = (): Settings => current

function readFromDisk(): Settings {
  try {
    return sanitizeSettings(JSON.parse(readFileSync(settingsPath(), 'utf8')))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.error('settings.json okunamadı, varsayılanlar:', e)
    return { ...DEFAULT_SETTINGS }
  }
}

// Atomik yaz (notlardaki gibi: önce .tmp, sonra yerine taşı).
function writeNow(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  try {
    const tmp = settingsPath() + '.tmp'
    writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8')
    renameSync(tmp, settingsPath())
  } catch (e) {
    console.error('Ayarlar kaydedilemedi:', e)
  }
}

// Kaydırıcı sürüklenirken her adımda diske yazmamak için kısa bekleme.
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(writeNow, 300)
}

/** Çıkışta bekleyen ayar kaydını hemen yaz. */
export function flushSettings(): void {
  if (saveTimer) writeNow()
}

/** Kısayolu Windows'a kaydet. Olmazsa (başka program kullanıyor / geçersiz) eskisini geri kur. */
function registerShortcut(accel: string): boolean {
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut)
  let ok = false
  try {
    ok = globalShortcut.register(accel, onShortcut)
  } catch {
    ok = false // geçersiz tuş kombinasyonu
  }
  if (ok) {
    registeredShortcut = accel
    return true
  }
  if (registeredShortcut) globalShortcut.register(registeredShortcut, onShortcut)
  return false
}

function applyLoginItem(enabled: boolean): void {
  // Geliştirme modunda uygulama: Windows her açılışta çıplak Electron'u başlatırdı.
  // Mağaza sürümünde bu yol çalışmaz; orada paketin başlangıç görevi var (Windows Ayarları'ndan yönetilir).
  if (!app.isPackaged || IS_STORE) return
  app.setLoginItemSettings({ openAtLogin: enabled })
}

export function updateSettings(patch: Partial<Settings>): SettingsResult {
  const next = sanitizeSettings({ ...current, ...patch })
  let error: string | null = null

  if (next.shortcut !== current.shortcut && !registerShortcut(next.shortcut)) {
    next.shortcut = current.shortcut
    error = mt()('settings.shortcutTaken')
  }
  if (next.theme !== current.theme) nativeTheme.themeSource = next.theme
  if (next.launchAtStartup !== current.launchAtStartup) applyLoginItem(next.launchAtStartup)

  current = next
  scheduleSave()
  onChange(current)
  return error ? { ok: false, settings: current, error } : { ok: true, settings: current }
}

/**
 * Notların Dosya Gezgini'nde görünen gerçek yeri. Mağaza (MSIX) sürümünde Windows, programın
 * %APPDATA%'ya yazdıklarını paketin özel klasörüne yönlendirir; Gezgin paketin dışında çalıştığı
 * için %APPDATA%\Sill'i açarsa notları göremez. O yüzden paketin klasörünü buluyoruz:
 * %LOCALAPPDATA%\Packages\<paket>\LocalCache\Roaming\Sill
 */
function dataFolderForExplorer(): string {
  const dir = app.getPath('userData')
  if (!IS_STORE || !process.env.LOCALAPPDATA) return dir
  try {
    const root = join(process.env.LOCALAPPDATA, 'Packages')
    for (const name of readdirSync(root)) {
      if (!/sill/i.test(name)) continue
      const candidate = join(root, name, 'LocalCache', 'Roaming', 'Sill')
      if (existsSync(join(candidate, 'data.json'))) return candidate
    }
  } catch {
    // bulunamazsa normal yol
  }
  return dir
}

/** Açılışta bir kez: dosyadan oku, temayı/kısayolu uygula, arayüz köprüsünü kur. */
export function initSettings(opts: { onShortcut: () => void; onChange: (s: Settings) => void }): void {
  onShortcut = opts.onShortcut
  onChange = opts.onChange
  current = readFromDisk()
  nativeTheme.themeSource = current.theme
  // Kurulu sürümde her açılışta Windows başlangıç kaydını ayar dosyasıyla eşitle
  // (ör. yeniden kurulumdan sonra kayıt kaybolduysa geri gelsin).
  applyLoginItem(current.launchAtStartup)

  if (!registerShortcut(current.shortcut)) {
    console.warn(`Kısayol kaydedilemedi (başka bir program kullanıyor olabilir): ${current.shortcut}`)
  }

  ipcMain.handle('settings:get', () => ({ settings: current, isPackaged: app.isPackaged, isStore: IS_STORE }))
  ipcMain.handle('settings:set', (_e, patch: unknown) =>
    updateSettings(typeof patch === 'object' && patch !== null ? (patch as Partial<Settings>) : {})
  )
  // Kısayol kaydedilirken mevcut kısayol geçici olarak bırakılır (basınca panel kapanmasın diye).
  ipcMain.on('settings:recording', (_e, recording: unknown) => {
    if (recording === true && registeredShortcut) {
      globalShortcut.unregister(registeredShortcut)
      registeredShortcut = null
    } else if (recording === false && !registeredShortcut) {
      registerShortcut(current.shortcut)
    }
  })
  // Not klasörünü Dosya Gezgini'nde aç, data.json seçili gelsin.
  // (shell.openPath burada "başarılı" dönüp pencere açmıyordu; showItemInFolder güvenilir çalışıyor.)
  ipcMain.on('settings:open-data-folder', () => {
    const dir = dataFolderForExplorer()
    const file = join(dir, 'data.json')
    shell.showItemInFolder(existsSync(file) ? file : dir)
  })
  // Mağaza sürümü: "Windows açılışında başlat" Windows Ayarları → Başlangıç'tan yönetilir.
  ipcMain.on('settings:open-startup-settings', () => {
    void shell.openExternal('ms-settings:startupapps')
  })
  // "Kahve ısmarla": sadece sabit bağış adresi açılır.
  ipcMain.on('app:open-support', () => {
    void shell.openExternal(SUPPORT_URL)
  })
}
