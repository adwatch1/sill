// Not içine eklenen dosyalar ("ek"ler) — arka plan ve arayüz ortak kullanır.
//
// Ekler data.json'a GÖMÜLMEZ: o dosya her tuş vuruşunda baştan yazılıyor, içine megabaytlar
// koymak kaydı yavaşlatır ve bozulma riskini büyütür. Ekler ayrı dosyalar hâlinde durur ve
// adları **içeriklerinin parmak izidir** (SHA-256). Bunun üç faydası var:
//   1. Aynı görsel üç nota bırakılsa diskte tek dosya olur.
//   2. İki kopya aynı dosyaya bağımsız olarak aynı adı verir; ad çakışması olmaz.
//   3. Dosya adı içeriğe bağlı olduğu için ek dosyalar hiç değişmez, sadece eklenir/silinir.

export const IMAGE_EXTS = ['png', 'jpg', 'gif', 'bmp', 'webp'] as const
export type ImageExt = (typeof IMAGE_EXTS)[number]

/**
 * Programın içindeki oynatıcının (Chromium) çalabildiği ses türleri.
 * ⚠️ AIFF yok: Chromium çalamıyor. AIFF bırakılınca "WAV'a çevir" uyarısı çıkar.
 */
export const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'ogg', 'opus', 'flac', 'webm'] as const
export type AudioExt = (typeof AUDIO_EXTS)[number]

export const isImageExt = (v: string): v is ImageExt => IMAGE_EXTS.includes(v as ImageExt)
export const isAudioExt = (v: string): v is AudioExt => AUDIO_EXTS.includes(v as AudioExt)

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024 // 25 MB
/** 48 kHz 24-bit stereo WAV için ~12 dakika. */
export const MAX_AUDIO_BYTES = 200 * 1024 * 1024 // 200 MB
export const MAX_IMPORT_AT_ONCE = 20

/** Önizlemenin uzun kenarı (px). Panel dar, ızgara küçük; 320 fazlasıyla yetiyor. */
export const THUMB_HEIGHT = 320

export type ImportResult =
  | {
      ok: true
      kind: 'image' | 'audio'
      /** İçeriğin SHA-256 özeti — dosyanın adı ve kalıcı kimliği. */
      att: string
      ext: string
      /** Orijinalin piksel ölçüsü (0 = okunamadı; seste hep 0). Yatay/dikey yerleşimi buna göre seçilir. */
      w: number
      h: number
      name: string
    }
  | { ok: false; message: string }

/** Ek dosyasının adı mı? (SHA-256 özeti: 64 küçük onaltılık karakter) */
export const isHash = (v: string): boolean => /^[0-9a-f]{64}$/.test(v)

/** Orijinal dosyanın adresi (büyütülmüş görünüm için). */
export const attUrl = (att: string, ext: string): string =>
  isHash(att) ? `sill://media/att/${att}.${ext}` : ''

/** Küçük önizlemenin adresi (ızgarada gösterilen). */
export const thumbUrl = (att: string): string => (isHash(att) ? `sill://media/thumb/${att}.jpg` : '')
