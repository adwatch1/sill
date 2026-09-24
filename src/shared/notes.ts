// Uygulamanın veri yapısı — hem arka plan (kayıt) hem arayüz bu tanımı kullanır.
// Sıralama = dizideki sıra (ayrı bir "order" alanı yok). Bu yapı olduğu gibi data.json'a yazılır.

// ── Notun içeriği: blok listesi ────────────────────────────────
// Bir not artık tek bir yazı kutusu değil, sıralı parçalardan oluşuyor: yazı · görsel · ses.
// Diskte `blocks` SADECE medya içeren notlarda bulunur; düz yazı notları eskisi gibi
// yalnızca `content` ile yazılır (bkz. subtabToDisk). Böylece eski sürümler de okuyabilir.

export interface BlockBase {
  id: string
  /** Bu parça en son ne zaman değişti (iki sürümü birleştirirken hangisinin yeni olduğunu söyler). */
  updatedAt: number
}

export interface TextBlock extends BlockBase {
  type: 'text'
  text: string
}

/** Not içine bırakılmış görsel. Dosyanın kendisi ayrı durur (bkz. shared/media.ts). */
export interface ImageBlock extends BlockBase {
  type: 'image'
  /** Ek dosyasının adı = içeriğinin SHA-256 özeti. */
  att: string
  ext: string
  /** Orijinalin piksel ölçüsü. Izgarada yatay mı dikey mi duracağını belirler (0 = bilinmiyor). */
  w: number
  h: number
  name?: string
  /** Kullanıcı yerleşimi elle değiştirdiyse. Yoksa ölçüden hesaplanır. */
  orient?: 'wide' | 'tall'
}

/** Not içine bırakılmış ses dosyası. Dosyası görseller gibi `attachments\` altında. */
export interface AudioBlock extends BlockBase {
  type: 'audio'
  att: string
  ext: string
  /** Süre (ms). Ekleme anında okunur; okunamadıysa yok, oynatıcı dosyadan öğrenir. */
  durationMs?: number
  name?: string
}

/**
 * Video linki kartı. Şimdilik sadece YouTube. Küçük resim internetten BİR KEZ indirilir
 * ve görseller gibi `attachments\` altına konur; sonra kart internetsiz de görünür.
 * `att` ve `title` yoksa kart resimsiz gösterilir (önizleme kapalı / internet yok).
 */
export interface LinkBlock extends BlockBase {
  type: 'link'
  provider: 'youtube'
  /** Yapıştırılan hâli (gösterim ve kopyalama için). Açarken KULLANILMAZ, adres kimlikten kurulur. */
  url: string
  videoId: string
  /** Başlangıç saniyesi (linkte …&t=90s varsa). */
  start?: number
  title?: string
  channel?: string
  /** Küçük resmin ek dosyası (SHA-256) ve uzantısı. */
  att?: string
  ext?: string
}

/**
 * Tanınmayan blok (programın daha yeni bir sürümünden gelmiş olabilir).
 * Ekranda gösterilmez ama **asla atılmaz**: eski bir sürüm, yeni bir parça türünü silmemeli.
 */
export interface UnknownBlock extends BlockBase {
  type: string
}

export type Block = TextBlock | ImageBlock | AudioBlock | LinkBlock | UnknownBlock

export const isTextBlock = (b: Block): b is TextBlock =>
  b.type === 'text' && typeof (b as TextBlock).text === 'string'

export const isImageBlock = (b: Block): b is ImageBlock =>
  b.type === 'image' && typeof (b as ImageBlock).att === 'string'

export const isAudioBlock = (b: Block): b is AudioBlock =>
  b.type === 'audio' && typeof (b as AudioBlock).att === 'string'

export const isLinkBlock = (b: Block): b is LinkBlock =>
  b.type === 'link' &&
  (b as LinkBlock).provider === 'youtube' &&
  typeof (b as LinkBlock).videoId === 'string' &&
  typeof (b as LinkBlock).url === 'string'

/** Görsel ızgarada iki kareyi yan yana mı (yatay) yoksa alt alta mı (dikey) alacak? */
export const imageOrient = (b: ImageBlock): 'wide' | 'tall' =>
  b.orient === 'wide' || b.orient === 'tall' ? b.orient : b.w >= b.h ? 'wide' : 'tall'

export const newTextBlock = (text = '', updatedAt = Date.now()): TextBlock => ({
  id: crypto.randomUUID(),
  type: 'text',
  text,
  updatedAt
})

/** Tanınmayan bloklar düz yazıya böyle iner (aşağıdaki "ayna" için). */
const PLACEHOLDER: Record<string, string> = { image: '[görsel]', audio: '[ses]' }

/**
 * Blokların düz yazı "aynası". `content` alanı hep bunu tutar.
 * Tek bir yazı bloğu varsa sonuç birebir o yazıdır — yani düz yazı notlarının dosyası değişmez.
 * Ayna sayesinde: eski sürüm notu okuyabilir, silme onayı "boş mu?" sorusunu doğru yanıtlar,
 * ileride arama düz metin taraması olarak kalabilir.
 */
export function mirrorContent(blocks: Block[]): string {
  return blocks
    // Link aynada linkin kendisi olarak durur: eski sürüm de, ileride arama da onu görür.
    .map((b) => (isTextBlock(b) ? b.text : isLinkBlock(b) ? b.url : (PLACEHOLDER[b.type] ?? '[öğe]')))
    .filter((part) => part !== '') // boş yazı blokları aynada yer kaplamasın
    .join('\n\n')
}

export interface Subtab {
  id: string
  title: string
  /** Düz yazı hâli. `blocks` varsa bunun aynasıdır. */
  content: string
  /** Bellekte her zaman dolu; diske sadece medya varsa yazılır. */
  blocks?: Block[]
  updatedAt: number
}

/** Tab renkleri (Apple sistem renkleri). Sıra = menüdeki sıra. */
export const TAB_COLORS = ['blue', 'pink', 'green', 'yellow', 'purple', 'orange'] as const
export type TabColor = (typeof TAB_COLORS)[number]

export const isTabColor = (v: unknown): v is TabColor => TAB_COLORS.includes(v as TabColor)

export interface Tab {
  id: string
  title: string
  /** İsteğe bağlı. Yoksa/tanınmıyorsa renksiz gösterilir. */
  color?: TabColor | null
  subtabs: Subtab[]
  activeSubtabId: string | null
}

export interface NotesData {
  version: 1
  tabs: Tab[]
  activeTabId: string | null
}

export type SaveResult = { ok: true } | { ok: false; error: string }

const isStr = (v: unknown): v is string => typeof v === 'string'
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * Notun içindeki bloklar (yazı / görsel / ses / video linki).
 * Kontrol bilerek gevşek: sadece "id'si ve türü olan nesneler listesi" aranıyor.
 * İleride eklenecek yeni bir blok türünü eski sürüm "bozuk dosya" sanmasın; tanımadığı
 * bloğu göstermesin ama ASLA atmasın.
 */
function isBlockList(v: unknown): boolean {
  if (v === undefined) return true // medya içermeyen not: blocks alanı hiç yok
  return Array.isArray(v) && v.every((b) => isObj(b) && isStr(b.id) && isStr(b.type))
}

// ── Diskten belleğe / bellekten diske ──────────────────────────
// Bellekte her notun `blocks`'u vardır (arayüz tek bir kuralla çalışsın diye).
// Diske yazarken medya içermeyen not eski hâline döner: sadece `content`.

/** Diskten gelen notu belleğe uygun hâle getir: blocks yoksa tek yazı bloğu üret. */
function normalizeSubtab(sub: Subtab): Subtab {
  const raw = Array.isArray(sub.blocks) && sub.blocks.length > 0 ? sub.blocks : null
  const blocks: Block[] = raw
    ? // Eksik alanları tamamla: dosyada yalnızca id ve type zorunlu.
      raw.map((b) => (typeof b.updatedAt === 'number' ? b : { ...b, updatedAt: sub.updatedAt }))
    : [newTextBlock(sub.content, sub.updatedAt)]
  return { ...sub, blocks, content: mirrorContent(blocks) }
}

export function normalizeNotes(data: NotesData): NotesData {
  return {
    ...data,
    tabs: data.tabs.map((t) => ({ ...t, subtabs: t.subtabs.map(normalizeSubtab) }))
  }
}

/** Diske yazılacak hâl: medya yoksa `blocks` alanı hiç yazılmaz (dosya eskisiyle aynı kalır). */
function subtabToDisk(sub: Subtab): Subtab {
  const blocks = sub.blocks ?? []
  const content = mirrorContent(blocks)
  if (blocks.every(isTextBlock)) {
    const { blocks: _yazilmaz, ...rest } = sub
    return { ...rest, content }
  }
  return { ...sub, blocks, content }
}

export function notesToDisk(data: NotesData): NotesData {
  return {
    ...data,
    tabs: data.tabs.map((t) => ({ ...t, subtabs: t.subtabs.map(subtabToDisk) }))
  }
}

/**
 * Blokları düzene sok: yan yana kalmış iki yazı bloğunu birleştir, sonu hep yazı bloğu yap.
 * (Aradaki görsel silinince iki yazı bloğu komşu kalır; not hep yazılabilir bitmeli.)
 */
export function canonicalBlocks(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    const prev = out[out.length - 1]
    if (isTextBlock(b) && prev && isTextBlock(prev)) {
      out[out.length - 1] = { ...prev, text: `${prev.text}\n${b.text}`, updatedAt: Date.now() }
    } else {
      out.push(b)
    }
  }
  // Not her zaman yazılabilir başlasın ve bitsin: başta/sonda görsel varsa boş birer
  // yazı bloğu eklenir, yoksa imleci oraya koyacak yer kalmaz.
  const last = out[out.length - 1]
  if (!last || !isTextBlock(last)) out.push(newTextBlock(''))
  if (!isTextBlock(out[0])) out.unshift(newTextBlock(''))
  return out
}

/** Diskten okunan içerik gerçekten bizim formatımızda mı? (Bozuk/yabancı dosyayı yüklememek için.) */
export function isNotesData(v: unknown): v is NotesData {
  if (!isObj(v) || v.version !== 1 || !Array.isArray(v.tabs)) return false
  if (v.activeTabId !== null && !isStr(v.activeTabId)) return false
  return v.tabs.every(
    (t) =>
      isObj(t) &&
      isStr(t.id) &&
      isStr(t.title) &&
      // Renk kontrolü bilerek esnek: ileride eklenecek yeni bir rengi eski sürüm "bozuk dosya" sanmasın.
      (t.color === undefined || t.color === null || isStr(t.color)) &&
      (t.activeSubtabId === null || isStr(t.activeSubtabId)) &&
      Array.isArray(t.subtabs) &&
      t.subtabs.every(
        (s) =>
          isObj(s) &&
          isStr(s.id) &&
          isStr(s.title) &&
          isStr(s.content) &&
          typeof s.updatedAt === 'number' &&
          isBlockList(s.blocks)
      )
  )
}
