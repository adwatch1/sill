// YouTube linklerini tanıma — arka plan ve arayüz ortak kullanır.
//
// Linkin kendisine değil, içinden çıkardığımız **video kimliğine** güveniyoruz (11 karakter:
// harf, rakam, - ve _). Tarayıcıda açılacak adres de, indirilecek küçük resmin adresi de bu
// kimlikten sıfırdan kuruluyor. Böylece nota yapıştırılan bir link bizi YouTube dışında bir
// yere götüremez.

export interface YouTubeRef {
  videoId: string
  /** Linkte başlangıç zamanı varsa (…&t=90s), saniye. */
  start?: number
}

const ID = /^[A-Za-z0-9_-]{11}$/
const HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']

export const isVideoId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

/** "90", "90s", "1m30s", "1h2m3s" → saniye. */
function parseStart(v: string | null): number | undefined {
  if (!v) return undefined
  if (/^\d+$/.test(v)) return Number(v)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v)
  if (!m || !m[0]) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/**
 * Metin TEK BAŞINA bir YouTube linki mi? Cümle içinde geçen link sayılmaz (o yazı olarak kalır).
 * Tanınan biçimler: watch?v=… · youtu.be/… · shorts/… · live/… · embed/…
 */
export function parseYouTube(text: string): YouTubeRef | null {
  const t = text.trim()
  if (!t || /\s/.test(t)) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  if (!HOSTS.includes(host)) return null

  let id: string | null = null
  if (host.endsWith('youtu.be')) {
    id = url.pathname.split('/')[1] ?? null
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v')
  } else {
    const m = /^\/(?:shorts|live|embed)\/([^/]+)/.exec(url.pathname)
    id = m ? m[1] : null
  }
  if (!isVideoId(id)) return null
  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'))
  return start ? { videoId: id, start } : { videoId: id }
}

/** Tarayıcıda açılacak adres — her zaman kimlikten yeniden kurulur. */
export function youTubeWatchUrl(ref: YouTubeRef): string {
  return `https://www.youtube.com/watch?v=${ref.videoId}${ref.start ? `&t=${ref.start}s` : ''}`
}

/** Arka plandan dönen önizleme: küçük resim (ek dosyası olarak) ve başlık. */
export type YouTubePreview =
  | { ok: true; att?: string; ext?: string; title?: string; channel?: string }
  | { ok: false; reason: 'disabled' | 'offline' | 'invalid' }
