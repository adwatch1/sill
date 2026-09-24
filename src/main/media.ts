import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { createHash } from 'crypto'
import { createReadStream, promises as fs } from 'fs'
import { Readable } from 'stream'
import { basename, dirname, join } from 'path'
import { pathToFileURL } from 'url'
import { renameWithRetry } from './util'
import {
  AUDIO_EXTS,
  IMAGE_EXTS,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  MAX_IMPORT_AT_ONCE,
  THUMB_HEIGHT,
  isAudioExt,
  isImageExt,
  type ImportResult
} from '../shared/media'

// Eklerin diskteki yeri (notlarla aynı klasörün altında):
//   attachments\a3\a3f1….jpg   → orijinal dosya (görsel ya da ses), asla küçültülmez
//   thumbs\a3\a3f1….jpg        → görsel önizlemesi; silinirse kendiliğinden yeniden üretilir
// İlk iki harf alt klasör oluyor: tek bir klasörde binlerce dosya birikmesin.

const userDir = (): string => app.getPath('userData')
const shard = (hash: string): string => hash.slice(0, 2)
const attPath = (hash: string, ext: string): string =>
  join(userDir(), 'attachments', shard(hash), `${hash}.${ext}`)
const thumbPath = (hash: string): string => join(userDir(), 'thumbs', shard(hash), `${hash}.jpg`)

const fail = (message: string): ImportResult => ({ ok: false, message })
const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1)

const TYPE_MESSAGE =
  'Bu dosya türü eklenemiyor. Görsel için PNG, JPG, GIF, BMP, WebP; ses için MP3, WAV, M4A, OGG, Opus, FLAC, WebM olmalı.'
const AIFF_MESSAGE = 'AIFF dosyaları çalınamıyor. Dosyayı WAV olarak dışa aktarıp öyle ekleyin.'

const exists = async (p: string): Promise<boolean> =>
  fs
    .access(p)
    .then(() => true)
    .catch(() => false)

type Sniffed = { kind: 'image' | 'audio'; ext: string } | { kind: 'aiff' } | null

/**
 * Dosyanın gerçekten ne olduğunu ilk baytlarından anla. Uzantı bir ipucudur, kanıt değil:
 * ".jpg" adını taşıyan bir çalıştırılabilir dosyayı içeri almayalım.
 * İlk 64 bayt yeter (Ogg dosyasında Opus imzası ilk sayfada).
 */
function sniff(buf: Buffer): Sniffed {
  if (buf.length < 12) return null
  const ascii = (from: number, to: number): string => buf.toString('ascii', from, to)
  // Görseller
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { kind: 'image', ext: 'png' }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', ext: 'jpg' }
  if (ascii(0, 3) === 'GIF') return { kind: 'image', ext: 'gif' }
  if (buf[0] === 0x42 && buf[1] === 0x4d) return { kind: 'image', ext: 'bmp' }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { kind: 'image', ext: 'webp' }
  // Sesler
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { kind: 'audio', ext: 'wav' }
  if (ascii(0, 4) === 'FORM' && (ascii(8, 12) === 'AIFF' || ascii(8, 12) === 'AIFC')) return { kind: 'aiff' }
  if (ascii(0, 3) === 'ID3') return { kind: 'audio', ext: 'mp3' }
  // Etiketsiz MP3: çerçeve eşitleme bitleri + katman bitleri 00 değil (00 olan AAC'dir, onu almıyoruz).
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0) return { kind: 'audio', ext: 'mp3' }
  if (ascii(0, 4) === 'fLaC') return { kind: 'audio', ext: 'flac' }
  if (ascii(0, 4) === 'OggS') {
    return { kind: 'audio', ext: buf.subarray(0, 64).includes('OpusHead') ? 'opus' : 'ogg' }
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: 'audio', ext: 'webm' }
  // MP4 kabı (M4A). HEIC fotoğraf da aynı kabı kullanır; onu markasından ayırıyoruz.
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (['M4A ', 'M4B ', 'mp41', 'mp42', 'isom', 'iso2', 'dash'].includes(brand)) {
      return { kind: 'audio', ext: 'm4a' }
    }
  }
  return null
}

/** Önce .tmp'ye yaz, sonra yerine taşı (notlarla aynı güvenli yazım). */
async function writeAtomic(dest: string, data: Buffer | { copyFrom: string }): Promise<void> {
  await fs.mkdir(dirname(dest), { recursive: true })
  const tmp = `${dest}.tmp`
  if (Buffer.isBuffer(data)) await fs.writeFile(tmp, data)
  else await fs.copyFile(data.copyFrom, tmp)
  await renameWithRetry(tmp, dest)
}

/**
 * Önizleme üret. Orijinal ASLA küçültülmez — kullanıcının dosyasını sessizce bozmayız.
 * nativeImage bazı dosyaları (CMYK JPEG, HEIC, çok büyük görseller) açamaz; o zaman
 * ölçü 0 döner ve arayüz orijinali gösterir.
 */
async function makeThumb(hash: string, srcPath: string): Promise<{ w: number; h: number }> {
  const img = nativeImage.createFromPath(srcPath)
  if (img.isEmpty()) return { w: 0, h: 0 }
  const { width, height } = img.getSize()
  const dest = thumbPath(hash)
  if (!(await exists(dest))) {
    const small = height > THUMB_HEIGHT ? img.resize({ height: THUMB_HEIGHT, quality: 'better' }) : img
    await writeAtomic(dest, small.toJPEG(82))
  }
  return { w: width, h: height }
}

/** Türün boyut sınırını aşıyor mu? Aşıyorsa hata mesajı döner. */
function tooBig(kind: 'image' | 'audio', size: number): string | null {
  const max = kind === 'audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES
  if (size <= max) return null
  return `Dosya çok büyük (${mb(size)} MB). ${kind === 'audio' ? 'Ses' : 'Görsel'} en fazla ${Math.round(max / 1024 / 1024)} MB olabilir.`
}

/**
 * Bellekteki baytları içeri al (yapıştırılan ekran görüntüsü): doğrula, tekilleştir, kopyala,
 * görselse önizleme üret.
 */
export async function importBuffer(buf: Buffer, name: string): Promise<ImportResult> {
  const s = sniff(buf)
  if (!s) return fail(TYPE_MESSAGE)
  if (s.kind === 'aiff') return fail(AIFF_MESSAGE)
  const big = tooBig(s.kind, buf.length)
  if (big) return fail(big)

  const hash = createHash('sha256').update(buf).digest('hex')
  const dest = attPath(hash, s.ext)
  // Aynı içerik daha önce eklendiyse tekrar yazma — diskte tek kopya dursun.
  if (!(await exists(dest))) await writeAtomic(dest, buf)

  const { w, h } = s.kind === 'image' ? await makeThumb(hash, dest) : { w: 0, h: 0 }
  return { ok: true, kind: s.kind, att: hash, ext: s.ext, w, h, name }
}

/** Dosyanın ilk baytları (tür tespiti için). */
async function readHead(path: string): Promise<Buffer> {
  const fh = await fs.open(path, 'r')
  try {
    const buf = Buffer.alloc(64)
    const { bytesRead } = await fh.read(buf, 0, 64, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

/** Dosyanın özetini akarak hesapla: 200 MB'lık bir WAV'ı belleğe almayalım. */
function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => h.update(chunk))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })
}

async function importOne(path: string): Promise<ImportResult> {
  try {
    const st = await fs.stat(path)
    if (!st.isFile()) return fail('Bu bir dosya değil.')
    // Önce türüne ve boyutuna bak, sonra oku: 4 GB'lık bir dosyayı belleğe almayalım.
    const s = sniff(await readHead(path))
    if (!s) return fail(TYPE_MESSAGE)
    if (s.kind === 'aiff') return fail(AIFF_MESSAGE)
    const big = tooBig(s.kind, st.size)
    if (big) return fail(big)

    if (s.kind === 'image') return await importBuffer(await fs.readFile(path), basename(path))

    // Ses: akarak özetle, diskten diske kopyala.
    const hash = await hashFile(path)
    const dest = attPath(hash, s.ext)
    if (!(await exists(dest))) await writeAtomic(dest, { copyFrom: path })
    return { ok: true, kind: 'audio', att: hash, ext: s.ext, w: 0, h: 0, name: basename(path) }
  } catch (e) {
    console.error('Dosya eklenemedi:', path, e)
    return fail('Dosya okunamadı.')
  }
}

/**
 * Ses dosyasını istenen aralıkla ver. Oynatıcı ileri sarınca "şu bayttan itibaren" diye
 * sorar (Range isteği); cevap veremezsek çubukta ileri sarmak başa atar.
 */
async function serveRange(abs: string, ext: string, rangeHeader: string | null): Promise<Response> {
  const st = await fs.stat(abs).catch(() => null)
  if (!st) return new Response(null, { status: 404 })
  const size = st.size
  const mime: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    flac: 'audio/flac',
    webm: 'audio/webm'
  }
  const headers = new Headers({
    'Content-Type': mime[ext] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable'
  })

  let start = 0
  let end = size - 1
  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null
  if (m) {
    if (m[1] === '' && m[2] !== '') {
      start = Math.max(0, size - Number(m[2])) // "son N bayt"
    } else {
      start = Number(m[1])
      if (m[2] !== '') end = Math.min(Number(m[2]), size - 1)
    }
    if (start > end || start >= size) {
      headers.set('Content-Range', `bytes */${size}`)
      return new Response(null, { status: 416, headers })
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  }
  headers.set('Content-Length', String(end - start + 1))
  const body = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream
  return new Response(body, { status: m ? 206 : 200, headers })
}

/**
 * `sill://` adres şeması. Arayüz kumlanmış ve CSP 'self' olduğu için yerel bir dosyayı
 * ekranda göstermenin tek temiz yolu bu.
 * ⚠️ Adresten ASLA dosya yolu alınmaz — sadece doğrulanmış özet ve uzantı alınır, mutlak yol
 * burada `userData`'dan yeniden kurulur. Böylece "klasör dışına çıkma" diye bir ihtimal kalmaz.
 */
export function registerMediaProtocol(): void {
  protocol.handle('sill', async (req) => {
    const url = new URL(req.url)
    if (url.host !== 'media') return new Response(null, { status: 404 })

    const m = /^\/(att|thumb)\/([0-9a-f]{64})\.([a-z0-9]{2,5})$/.exec(url.pathname)
    if (!m) return new Response(null, { status: 400 })
    const [, kind, hash, ext] = m

    if (kind === 'att' && isAudioExt(ext)) {
      return serveRange(attPath(hash, ext), ext, req.headers.get('Range'))
    }
    if (kind === 'att' && !isImageExt(ext)) return new Response(null, { status: 403 })

    const abs = kind === 'att' ? attPath(hash, ext) : thumbPath(hash)
    const res = await net.fetch(pathToFileURL(abs).toString()).catch(() => null)
    if (!res || !res.ok) return new Response(null, { status: 404 })

    // Adı içeriğinin özeti olan bir dosya asla değişemez → sonsuza kadar önbelleklenebilir.
    const headers = new Headers(res.headers)
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    return new Response(res.body, { status: res.status, headers })
  })
}

interface MediaHooks {
  /** Dosya seçme penceresi açıkken panel kendiliğinden kapanmamalı. */
  onDialogOpen: () => void
  onDialogClose: () => void
}

export function registerMediaIpc(hooks: MediaHooks): void {
  const importAll = async (paths: string[]): Promise<ImportResult[]> => {
    const out: ImportResult[] = []
    for (const p of paths.slice(0, MAX_IMPORT_AT_ONCE)) out.push(await importOne(p))
    return out
  }

  ipcMain.handle('media:import-paths', async (_e, paths: unknown): Promise<ImportResult[]> => {
    if (!Array.isArray(paths)) return []
    return importAll(paths.filter((p): p is string => typeof p === 'string'))
  })

  // Yapıştırılan görsel. Panodaki bitmap'in (ekran görüntüsü) diskte bir dosyası yoktur,
  // o yüzden baytları arayüzden geliyor. Tür yine ilk baytlardan anlaşılıyor —
  // arayüzün "bu bir PNG" demesine güvenmiyoruz.
  ipcMain.handle('media:import-bytes', async (_e, data: unknown, name: unknown): Promise<ImportResult> => {
    if (!(data instanceof Uint8Array)) return fail('Yapıştırılan içerik okunamadı.')
    return importBuffer(Buffer.from(data), typeof name === 'string' && name ? name : 'Pano görseli.png')
  })

  // Windows gizlilik ayarında mikrofon kapalıysa program izin isteyemiyor, Windows sessizce
  // reddediyor. Kullanıcıyı doğrudan o ayar sayfasına götürüyoruz. Adres sabit: arayüzden
  // gelen hiçbir şey açılmaz.
  ipcMain.on('media:open-mic-settings', () => {
    void shell.openExternal('ms-settings:privacy-microphone')
  })

  // "Görsel ekle…" / "Ses ekle…": dosya seçme penceresi. Yol arayüzden gelmez, kullanıcının
  // seçtiği dosyalar doğrudan burada içeri alınır.
  ipcMain.handle('media:pick', async (e, kind: unknown): Promise<ImportResult[]> => {
    const audio = kind === 'audio'
    const parent = BrowserWindow.fromWebContents(e.sender)
    const opts: OpenDialogOptions = {
      title: audio ? 'Ses ekle' : 'Görsel ekle',
      buttonLabel: 'Ekle',
      properties: ['openFile', 'multiSelections'],
      filters: audio
        ? [{ name: 'Ses dosyaları', extensions: [...AUDIO_EXTS, 'aif', 'aiff'] }]
        : [{ name: 'Görseller', extensions: [...IMAGE_EXTS, 'jpeg'] }]
    }
    hooks.onDialogOpen()
    try {
      // Pencereye bağlı açılırsa panelin önünde durur ve panelle birlikte gezer.
      const res = parent
        ? await dialog.showOpenDialog(parent, opts)
        : await dialog.showOpenDialog(opts)
      if (res.canceled) return []
      return await importAll(res.filePaths)
    } finally {
      hooks.onDialogClose()
    }
  })
}
