import type { BrowserWindow } from 'electron'
import { promises as fs } from 'fs'

/** Pencere var ve yok edilmemiş mi? (Kapanış sırasında pencere yok edilir; ona dokunmak hata verir.) */
export function alive(w: BrowserWindow | null): w is BrowserWindow {
  return w !== null && !w.isDestroyed()
}

/**
 * Hazır `.tmp` dosyasını asıl adına taşı. Windows'ta antivirüs vb. dosyayı anlık kilitleyebilir,
 * bu yüzden birkaç kez, giderek artan aralıklarla denenir. Yarım yazılmış bir dosya asla asıl
 * adı almaz: taşıma ya olur ya olmaz.
 */
export async function renameWithRetry(tmp: string, dest: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, dest)
      return
    } catch (e) {
      if (attempt >= 4) throw e
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)))
    }
  }
}
