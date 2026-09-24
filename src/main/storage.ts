import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { isNotesData, type NotesData, type SaveResult } from '../shared/notes'
import { renameWithRetry } from './util'

// Notların diskteki yeri: %APPDATA%\Sill\
//   data.json         → asıl dosya
//   data.json.tmp     → yazılırken kullanılan geçici dosya
//   data.backup.json  → günlük yedek (her gün ilk açılışta)
//   data.corrupt-*.json → okunamayan dosya (silinmez, kenara ayrılır)
const dir = () => app.getPath('userData')
const dataPath = () => join(dir(), 'data.json')
const tmpPath = () => join(dir(), 'data.json.tmp')
const backupPath = () => join(dir(), 'data.backup.json')

async function readValid(path: string): Promise<NotesData | 'missing' | 'invalid'> {
  let text: string
  try {
    text = await fs.readFile(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
    throw e
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return isNotesData(parsed) ? parsed : 'invalid'
  } catch {
    return 'invalid'
  }
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

async function makeDailyBackup(): Promise<void> {
  try {
    const stat = await fs.stat(backupPath())
    if (sameDay(stat.mtime, new Date())) return
  } catch {
    // yedek henüz yok → oluştur
  }
  await fs.copyFile(dataPath(), backupPath())
}

// Okuma ve yazmalar sırayla yapılsın (iki işlem aynı anda dosyaya dokunmasın).
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job)
  queue = next.catch(() => {})
  return next
}

async function readBackup(): Promise<NotesData | null> {
  const backup = await readValid(backupPath())
  return backup === 'missing' || backup === 'invalid' ? null : backup
}

/** Açılışta çağrılır. Ne asıl dosya ne yedek varsa null döner (arayüz örnek içerikle başlar). */
function loadNotes(): Promise<NotesData | null> {
  return enqueue(async () => {
    const main = await readValid(dataPath())
    if (main !== 'missing' && main !== 'invalid') {
      await makeDailyBackup().catch((e) => console.error('Yedek alınamadı:', e))
      return main
    }

    if (main === 'invalid') {
      // Asıl dosya bozuk: silme, kenara ayır.
      const aside = join(dir(), `data.corrupt-${Date.now()}.json`)
      await fs.rename(dataPath(), aside)
      console.error(`data.json okunamadı, kenara ayrıldı: ${aside}`)
    }

    // Asıl dosya yok veya bozuktu → yedekten dön ve asıl dosyayı hemen yeniden oluştur.
    const backup = await readBackup()
    if (backup) {
      await writeAtomic(backup)
      console.warn('Notlar yedekten geri yüklendi.')
    }
    return backup
  })
}

async function writeAtomic(data: NotesData): Promise<void> {
  await fs.writeFile(tmpPath(), JSON.stringify(data, null, 2), 'utf8')
  await renameWithRetry(tmpPath(), dataPath())
}

function saveNotes(data: unknown): Promise<SaveResult> {
  return enqueue(async (): Promise<SaveResult> => {
    if (!isNotesData(data)) return { ok: false, error: 'Geçersiz veri, kaydedilmedi' }
    try {
      await writeAtomic(data)
      return { ok: true }
    } catch (e) {
      console.error('Kayıt hatası:', e)
      return { ok: false, error: String(e) }
    }
  })
}

export function registerStorageIpc(): void {
  ipcMain.handle('notes:load', () => loadNotes())
  ipcMain.handle('notes:save', (_e, data: unknown) => saveNotes(data))
}
