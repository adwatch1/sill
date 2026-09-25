import koffi from 'koffi'

// Öndeki pencere birincil monitörün TAMAMINI (görev çubuğu dahil) kaplıyor mu?
// Oyunlar, Steam Big Picture, tam ekran video böyle çalışır; büyütülmüş sıradan bir pencere
// (ör. kurgu programı) görev çubuğunu açıkta bıraktığı için sayılmaz. Windows'un "tam ekran
// uygulama çalışıyor" kararı da aynı mantıkla verilir.
// Electron başka programların pencerelerini göremediği için Windows'un kendi işlevleri
// (user32.dll) koffi köprüsüyle çağrılıyor. Sadece okuma yapılır; hiçbir pencereye dokunulmaz.

const MONITOR_DEFAULTTONULL = 0
const MONITORINFOF_PRIMARY = 1

// Masaüstü, görev çubuğu, Alt+Tab / görev görünümü gibi Windows kabuğunun kendi pencereleri:
// ekranı kaplasalar da "tam ekran uygulama" değiller.
const SHELL_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'MultitaskingViewFrame',
  'XamlExplorerHostIslandWindow',
  'ForegroundStaging',
  'Windows.UI.Core.CoreWindow'
])

interface Api {
  foreground: () => unknown
  rect: (hwnd: unknown, out: Rect) => boolean
  monitor: (hwnd: unknown) => unknown
  monitorInfo: (mon: unknown, info: MonitorInfo) => boolean
  className: (hwnd: unknown, buf: Buffer, max: number) => number
  processId: (hwnd: unknown, out: number[]) => number
}
interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}
interface MonitorInfo {
  cbSize: number
  rcMonitor: Rect
  rcWork: Rect
  dwFlags: number
}

let api: Api | null | undefined

function load(): Api | null {
  if (api !== undefined) return api
  try {
    const user32 = koffi.load('user32.dll')
    const HWND = koffi.pointer('HWND', koffi.opaque())
    const HMONITOR = koffi.pointer('HMONITOR', koffi.opaque())
    koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
    koffi.struct('MONITORINFO', { cbSize: 'uint32', rcMonitor: 'RECT', rcWork: 'RECT', dwFlags: 'uint32' })
    const monitorFromWindow = user32.func('MonitorFromWindow', HMONITOR, [HWND, 'uint32'])
    api = {
      foreground: user32.func('GetForegroundWindow', HWND, []),
      rect: user32.func('bool __stdcall GetWindowRect(HWND hWnd, _Out_ RECT *lpRect)'),
      monitor: (hwnd) => monitorFromWindow(hwnd, MONITOR_DEFAULTTONULL),
      monitorInfo: user32.func('bool __stdcall GetMonitorInfoW(HMONITOR hMonitor, _Inout_ MONITORINFO *lpmi)'),
      className: user32.func('int __stdcall GetClassNameW(HWND hWnd, _Out_ uint16_t *lpClassName, int nMaxCount)'),
      processId: user32.func('uint32 __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *lpdwProcessId)')
    }
  } catch (e) {
    // Köprü yüklenemezse özellik sessizce devre dışı: program eskisi gibi çalışır.
    console.error('Tam ekran algılama kullanılamıyor:', e)
    api = null
  }
  return api
}

/**
 * Öndeki pencerenin durumu:
 *  'fullscreen' → birincil monitörü tamamen kaplayan başka bir program
 *  'normal'     → değil
 *  'own'        → öndeki pencere bizim (panel, büyütme, dosya seçici): kararı değiştirme
 */
export function foregroundState(): 'fullscreen' | 'normal' | 'own' {
  const a = load()
  if (!a) return 'normal'
  try {
    const hwnd = a.foreground()
    if (!hwnd) return 'normal'

    const pid = [0]
    a.processId(hwnd, pid)
    if (pid[0] === process.pid) return 'own'

    const buf = Buffer.alloc(512)
    const len = a.className(hwnd, buf, 256)
    if (SHELL_CLASSES.has(buf.toString('utf16le', 0, len * 2))) return 'normal'

    const mon = a.monitor(hwnd)
    if (!mon) return 'normal'
    const info: MonitorInfo = {
      cbSize: 40, // sizeof(MONITORINFO)
      rcMonitor: { left: 0, top: 0, right: 0, bottom: 0 },
      rcWork: { left: 0, top: 0, right: 0, bottom: 0 },
      dwFlags: 0
    }
    if (!a.monitorInfo(mon, info)) return 'normal'
    // Panel sadece birincil monitörde yaşıyor; başka ekrandaki oyun onu ilgilendirmez.
    if (!(info.dwFlags & MONITORINFOF_PRIMARY)) return 'normal'

    const r: Rect = { left: 0, top: 0, right: 0, bottom: 0 }
    if (!a.rect(hwnd, r)) return 'normal'
    const m = info.rcMonitor
    const covers = r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    return covers ? 'fullscreen' : 'normal'
  } catch {
    return 'normal'
  }
}
