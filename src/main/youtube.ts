import { ipcMain, net, shell } from 'electron'
import { importBuffer } from './media'
import { getSettings } from './settings'
import { isVideoId, youTubeWatchUrl, type YouTubePreview } from '../shared/youtube'

// ⚠️ Programın İNTERNETE ÇIKTIĞI TEK YER.
// Sill "yerel ve çevrimdışı" bir program; bu dosya o kuralın bilinçli ve dar bir istisnası.
// Sınırlar:
//   • Sadece kullanıcı nota bir YouTube linki koyduğunda, sadece o video için sorulur.
//   • Sadece iki adres: YouTube'un küçük resim sunucusu ve başlığı veren oEmbed adresi.
//     İkisi de video kimliğinden burada kuruluyor; arayüzden adres gelmez.
//   • Küçük resim bir kez indirilip ek dosyası olarak saklanır; sonra hep diskten gelir.
//   • Ayarlardaki "Link önizlemeleri" kapalıysa hiçbir istek yapılmaz.
//   • Arayüz internete hiç dokunmaz (CSP'si hâlâ sadece 'self' + sill:).

const TIMEOUT_MS = 8000
const MAX_THUMB_BYTES = 3 * 1024 * 1024
const MAX_TEXT = 300

/** Zaman aşımlı GET. Hata fırlatmaz: olmadıysa null. */
async function get(url: string): Promise<Response | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await net.fetch(url, { signal: ctl.signal, credentials: 'omit', redirect: 'follow' })
    return res.ok ? res : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Küçük resim. Önce 1280×720 (her videoda olmuyor), yoksa 480×360 — bu ikincisi 4:3 ve üstü
 * altı siyah bantlı; kart 16:9 kırptığı için bantlar görünmüyor.
 */
async function fetchThumb(id: string): Promise<{ att: string; ext: string } | null> {
  for (const name of ['maxresdefault', 'hqdefault']) {
    const res = await get(`https://i.ytimg.com/vi/${id}/${name}.jpg`)
    if (!res) continue
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_THUMB_BYTES) continue
    // Görsellerle aynı yol: ilk baytlardan gerçekten görsel mi diye bakılır, SHA-256 adıyla saklanır.
    const r = await importBuffer(buf, `${id}.jpg`)
    if (r.ok && r.kind === 'image') return { att: r.att, ext: r.ext }
  }
  return null
}

/** Başlık ve kanal adı (oEmbed: YouTube'un anahtar istemeyen herkese açık adresi). */
async function fetchInfo(id: string): Promise<{ title?: string; channel?: string } | null> {
  const watch = encodeURIComponent(youTubeWatchUrl({ videoId: id }))
  const res = await get(`https://www.youtube.com/oembed?format=json&url=${watch}`)
  if (!res) return null
  try {
    const j = (await res.json()) as Record<string, unknown>
    const text = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_TEXT) : undefined
    return { title: text(j.title), channel: text(j.author_name) }
  } catch {
    return null
  }
}

// Aynı video için aynı anda iki istek gitmesin (ör. aynı link iki nota yapıştırıldıysa).
const inFlight = new Map<string, Promise<YouTubePreview>>()

async function preview(id: string): Promise<YouTubePreview> {
  const [thumb, info] = await Promise.all([fetchThumb(id), fetchInfo(id)])
  if (!thumb && !info) return { ok: false, reason: 'offline' }
  return { ok: true, ...(thumb ?? {}), ...(info ?? {}) }
}

export function registerYouTubeIpc(): void {
  ipcMain.handle('link:youtube-preview', (_e, id: unknown): Promise<YouTubePreview> | YouTubePreview => {
    if (!isVideoId(id)) return { ok: false, reason: 'invalid' }
    if (!getSettings().linkPreviews) return { ok: false, reason: 'disabled' }
    let p = inFlight.get(id)
    if (!p) {
      p = preview(id).finally(() => inFlight.delete(id))
      inFlight.set(id, p)
    }
    return p
  })

  // Kartı tarayıcıda aç. Adres kimlikten kurulur; arayüzden gelen link açılmaz.
  ipcMain.on('link:open', (_e, ref: unknown) => {
    const r = (typeof ref === 'object' && ref !== null ? ref : {}) as { videoId?: unknown; start?: unknown }
    if (!isVideoId(r.videoId)) return
    const start = typeof r.start === 'number' && Number.isInteger(r.start) && r.start > 0 ? r.start : undefined
    void shell.openExternal(youTubeWatchUrl({ videoId: r.videoId, start }))
  })
}
