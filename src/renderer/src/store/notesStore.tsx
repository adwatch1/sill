import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  canonicalBlocks,
  isImageBlock,
  isLinkBlock,
  isTextBlock,
  mirrorContent,
  newTextBlock,
  normalizeNotes,
  notesToDisk,
  type Block,
  type LinkBlock,
  type NotesData,
  type Subtab,
  type Tab,
  type TabColor
} from '../../../shared/notes'
import { getT } from '../i18n'

/** Link kartında sonradan dolan alanlar (kimlik ve adres asla değişmez). */
export type LinkPatch = Partial<Pick<LinkBlock, 'title' | 'channel' | 'att' | 'ext'>>

// ── Değişiklik türleri ────────────────────────────────────────
// Veriyi değiştirmenin tek yolu bu "action"lar; hepsi aşağıdaki reducer'dan geçer.
// (Premiere'deki geçmiş paneli gibi: her değişiklik tanımlı bir adım.)
type Action =
  | { type: 'addTab'; id: string; title: string }
  | { type: 'renameTab'; id: string; title: string }
  | { type: 'deleteTab'; id: string }
  | { type: 'selectTab'; id: string }
  | { type: 'reorderTabs'; ids: string[] }
  | { type: 'setTabColor'; id: string; color: TabColor | null }
  | { type: 'addSubtab'; tabId: string; id: string; title: string }
  | { type: 'renameSubtab'; tabId: string; id: string; title: string }
  | { type: 'deleteSubtab'; tabId: string; id: string }
  | { type: 'selectSubtab'; tabId: string; id: string }
  | { type: 'reorderSubtabs'; tabId: string; ids: string[] }
  | { type: 'setBlockText'; tabId: string; subId: string; blockId: string; text: string }
  | { type: 'mergeBlockBack'; tabId: string; subId: string; blockId: string }
  | { type: 'insertBlocks'; tabId: string; subId: string; at: number; blocks: Block[] }
  | {
      type: 'insertBlocksAtCaret'
      tabId: string
      subId: string
      blockId: string
      from: number
      to: number
      blocks: Block[]
    }
  | { type: 'deleteBlock'; tabId: string; subId: string; blockId: string }
  | { type: 'setImageOrient'; tabId: string; subId: string; blockId: string; orient: 'wide' | 'tall' }
  | { type: 'patchLink'; tabId: string; subId: string; blockId: string; patch: LinkPatch }
  | { type: 'setBlocks'; tabId: string; subId: string; blocks: Block[] }

function newSubtab(id: string, title: string): Subtab {
  const now = Date.now()
  return { id, title, content: '', blocks: [newTextBlock('', now)], updatedAt: now }
}

/** Bir notun bloklarını değiştir: düz yazı aynası ve "düzenlendi" saati birlikte güncellenir. */
function withBlocks(s: Subtab, blocks: Block[]): Subtab {
  return { ...s, blocks, content: mirrorContent(blocks), updatedAt: Date.now() }
}

function updateSubtab(
  data: NotesData,
  tabId: string,
  subId: string,
  fn: (s: Subtab) => Subtab
): NotesData {
  return updateTab(data, tabId, (t) => ({
    ...t,
    subtabs: t.subtabs.map((s) => (s.id === subId ? fn(s) : s))
  }))
}

// Silinen öğenin yerine bir komşusunu seç (önce sağdaki/alttaki, yoksa soldaki/üstteki).
function neighborId<T extends { id: string }>(list: T[], removedId: string): string | null {
  const i = list.findIndex((x) => x.id === removedId)
  const next = list[i + 1] ?? list[i - 1]
  return next ? next.id : null
}

// Yeni sıradaki id'lere göre diz; listede olmayan (beklenmedik) öğe kaybolmasın, sona eklensin.
function reorderById<T extends { id: string }>(list: T[], ids: string[]): T[] {
  const byId = new Map(list.map((x) => [x.id, x]))
  const ordered = ids.flatMap((id) => byId.get(id) ?? [])
  return [...ordered, ...list.filter((x) => !ids.includes(x.id))]
}

function updateTab(data: NotesData, tabId: string, fn: (t: Tab) => Tab): NotesData {
  return { ...data, tabs: data.tabs.map((t) => (t.id === tabId ? fn(t) : t)) }
}

function reducer(data: NotesData, a: Action): NotesData {
  switch (a.type) {
    case 'addTab':
      return {
        ...data,
        tabs: [...data.tabs, { id: a.id, title: a.title, subtabs: [], activeSubtabId: null }],
        activeTabId: a.id
      }
    case 'renameTab':
      return updateTab(data, a.id, (t) => ({ ...t, title: a.title }))
    case 'deleteTab':
      return {
        ...data,
        tabs: data.tabs.filter((t) => t.id !== a.id),
        activeTabId: data.activeTabId === a.id ? neighborId(data.tabs, a.id) : data.activeTabId
      }
    case 'selectTab':
      return { ...data, activeTabId: a.id }
    case 'reorderTabs':
      return { ...data, tabs: reorderById(data.tabs, a.ids) }
    case 'setTabColor':
      return updateTab(data, a.id, (t) => ({ ...t, color: a.color }))
    case 'addSubtab':
      return updateTab(data, a.tabId, (t) => ({
        ...t,
        subtabs: [...t.subtabs, newSubtab(a.id, a.title)],
        activeSubtabId: a.id
      }))
    case 'renameSubtab':
      return updateTab(data, a.tabId, (t) => ({
        ...t,
        subtabs: t.subtabs.map((s) =>
          s.id === a.id ? { ...s, title: a.title, updatedAt: Date.now() } : s
        )
      }))
    case 'deleteSubtab':
      return updateTab(data, a.tabId, (t) => ({
        ...t,
        subtabs: t.subtabs.filter((s) => s.id !== a.id),
        activeSubtabId: t.activeSubtabId === a.id ? neighborId(t.subtabs, a.id) : t.activeSubtabId
      }))
    case 'selectSubtab':
      return updateTab(data, a.tabId, (t) => ({ ...t, activeSubtabId: a.id }))
    case 'reorderSubtabs':
      return updateTab(data, a.tabId, (t) => ({ ...t, subtabs: reorderById(t.subtabs, a.ids) }))
    case 'setBlockText':
      return updateSubtab(data, a.tabId, a.subId, (s) =>
        withBlocks(
          s,
          (s.blocks ?? []).map((b) =>
            b.id === a.blockId && isTextBlock(b) ? { ...b, text: a.text, updatedAt: Date.now() } : b
          )
        )
      )
    // Görselleri araya ekle. `at` = blok listesindeki konum (bloklar bölünmez, araya girilir).
    // -1 = notun sonu.
    case 'insertBlocks':
      return updateSubtab(data, a.tabId, a.subId, (s) => {
        const blocks = s.blocks ?? []
        // at < 0 → "notun sonuna": sondaki boş yazı satırının ÖNÜNE. Yoksa art arda eklenen
        // kayıtların arasında görünmez boş satırlar birikip kartları birbirinden uzaklaştırıyor.
        const last = blocks[blocks.length - 1]
        const end = last && isTextBlock(last) && last.text === '' ? blocks.length - 1 : blocks.length
        const at = a.at < 0 ? end : Math.max(0, Math.min(a.at, blocks.length))
        return withBlocks(s, canonicalBlocks([...blocks.slice(0, at), ...a.blocks, ...blocks.slice(at)]))
      })
    // Yapıştırma: görsel imlecin durduğu yere girer, yazı bloğu orada ikiye bölünür.
    // Seçili yazı varsa (from ≠ to) o parça gider — Windows'ta yapıştırma da böyle davranır.
    case 'insertBlocksAtCaret':
      return updateSubtab(data, a.tabId, a.subId, (s) => {
        const blocks = s.blocks ?? []
        const i = blocks.findIndex((b) => b.id === a.blockId)
        const cur = blocks[i]
        // Hedef yazı bloğu bulunamazsa (ör. bu arada silindiyse) sona ekle, kaybetme.
        if (i < 0 || !isTextBlock(cur)) {
          return withBlocks(s, canonicalBlocks([...blocks, ...a.blocks]))
        }
        const now = Date.now()
        const head: Block = { ...cur, text: cur.text.slice(0, a.from), updatedAt: now }
        const tail: Block = { ...newTextBlock(cur.text.slice(a.to)), updatedAt: now }
        return withBlocks(
          s,
          canonicalBlocks([...blocks.slice(0, i), head, ...a.blocks, tail, ...blocks.slice(i + 1)])
        )
      })
    case 'deleteBlock':
      return updateSubtab(data, a.tabId, a.subId, (s) =>
        withBlocks(s, canonicalBlocks((s.blocks ?? []).filter((b) => b.id !== a.blockId)))
      )
    case 'setImageOrient':
      return updateSubtab(data, a.tabId, a.subId, (s) =>
        withBlocks(
          s,
          (s.blocks ?? []).map((b) =>
            b.id === a.blockId && isImageBlock(b) ? { ...b, orient: a.orient, updatedAt: Date.now() } : b
          )
        )
      )
    // Link kartı tamamlandı: küçük resim ve başlık internetten sonradan geldi.
    case 'patchLink':
      return updateSubtab(data, a.tabId, a.subId, (s) =>
        withBlocks(
          s,
          (s.blocks ?? []).map((b) => (b.id === a.blockId && isLinkBlock(b) ? { ...b, ...a.patch } : b))
        )
      )
    // Blok listesini olduğu gibi geri koy — "Geri al" balonu bunu kullanır.
    case 'setBlocks':
      return updateSubtab(data, a.tabId, a.subId, (s) => withBlocks(s, a.blocks))
    // Yazı bloğunun en başında Backspace: bir önceki yazı bloğuyla birleş.
    // (Aralarındaki görsel silinince iki yazı bloğu komşu kalabiliyor.)
    case 'mergeBlockBack':
      return updateSubtab(data, a.tabId, a.subId, (s) => {
        const blocks = s.blocks ?? []
        const i = blocks.findIndex((b) => b.id === a.blockId)
        const cur = blocks[i]
        const prev = blocks[i - 1]
        if (i <= 0 || !isTextBlock(cur) || !isTextBlock(prev)) return s
        const merged: Block = { ...prev, text: prev.text + cur.text, updatedAt: Date.now() }
        return withBlocks(s, canonicalBlocks([...blocks.slice(0, i - 1), merged, ...blocks.slice(i + 1)]))
      })
  }
}

// İlk açılışta gösterilecek örnek notlar (sadece data.json hiç yoksa) — aynı zamanda kısa bir kullanım
// rehberi: 3 sekme × 2 not, görseller ve bir YouTube kartı, kullanıcının dilinde.
// Görseller programla birlikte gelir (bize ait, telifsiz), ilk açılışta not klasörüne kopyalanır.
// Video: Blender Foundation'ın "Big Buck Bunny"si (CC BY 3.0); küçük resmi kart görününce gelir.
const DEMO_VIDEO = { id: 'aqz-KE-bpKQ', title: 'Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film', channel: 'Blender' }

async function seedData(withMedia: boolean): Promise<NotesData> {
  const t = getT() // ilk açılışta arayüz dilinde
  const now = Date.now()
  const text = (s: string): Block => ({ ...newTextBlock(s, now) })
  // Örnek görseller: alınamazsa (ör. okuma hatası) notlar görselsiz kurulur, sorun değil.
  const imgs = withMedia ? await window.media.importDemo().catch(() => []) : []
  const image = (i: number): Block[] => {
    const r = imgs[i]
    if (!r || !r.ok || r.kind !== 'image') return []
    return [{ id: crypto.randomUUID(), type: 'image', att: r.att, ext: r.ext, w: r.w, h: r.h, name: r.name, updatedAt: now } as Block]
  }
  const video: Block = {
    id: crypto.randomUUID(),
    type: 'link',
    provider: 'youtube',
    url: `https://youtu.be/${DEMO_VIDEO.id}`,
    videoId: DEMO_VIDEO.id,
    title: DEMO_VIDEO.title,
    channel: DEMO_VIDEO.channel,
    updatedAt: now
  } as Block
  const note = (title: string, blocks: Block[]): Subtab => {
    const b = canonicalBlocks(blocks)
    return { id: crypto.randomUUID(), title, content: mirrorContent(b), blocks: b, updatedAt: now }
  }
  const tab = (title: string, color: TabColor, subtabs: Subtab[]): Tab => ({
    id: crypto.randomUUID(),
    title,
    color,
    subtabs,
    activeSubtabId: subtabs[0].id
  })
  const tabs = [
    tab(t('demo.welcomeTab'), 'blue', [
      note(t('demo.welcomeNote'), [text(t('demo.welcomeText')), ...image(0), text(t('demo.welcomeOutro'))]),
      note(t('demo.tipsNote'), [text(t('demo.tipsText'))])
    ]),
    tab(t('demo.dailyTab'), 'green', [
      note(t('demo.todoNote'), [text(t('demo.todoText'))]),
      note(t('demo.shoppingNote'), [text(t('demo.shoppingText'))])
    ]),
    tab(t('demo.ideasTab'), 'purple', [
      note(t('demo.moodNote'), [text(t('demo.moodText')), ...image(1), ...image(2), text(t('demo.moodInspo')), video, text('')]),
      note(t('demo.readingNote'), [text(t('demo.readingText'))])
    ])
  ]
  return { version: 1, tabs, activeTabId: tabs[0].id }
}

// ── Otomatik kayıt ────────────────────────────────────────────
const SAVE_DEBOUNCE_MS = 500 // yazmayı bıraktıktan bu kadar sonra diske yaz

/** 'saved' = diskte güncel · 'error' = son kayıt başarısız · 'disabled' = yükleme hatası, kayıt kapalı */
type SaveStatus = 'saved' | 'error' | 'disabled'

function useAutosave(data: NotesData, canSave: boolean) {
  const [status, setStatus] = useState<SaveStatus>(canSave ? 'saved' : 'disabled')
  const latest = useRef(data)
  const dirty = useRef(false)
  const initial = useRef(data)
  latest.current = data

  const saveNow = async () => {
    if (!canSave || !dirty.current) return
    dirty.current = false
    const result = await window.notes.save(notesToDisk(latest.current))
    setStatus(result.ok ? 'saved' : 'error')
    if (!result.ok) dirty.current = true // bir sonraki değişiklikte tekrar denensin
  }

  // Veri değişince zamanlayıcıyı yeniden kur (her tuşta sıfırlanır → yazma bitince kaydeder).
  useEffect(() => {
    if (!canSave || data === initial.current) return
    dirty.current = true
    const t = setTimeout(saveNow, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [data, canSave])

  // Program kapanırken arka plan "hemen kaydet" diyebilir.
  useEffect(() => window.notes.onFlushRequest(saveNow))

  return status
}

// ── Arayüzün kullandığı kanca (hook) ─────────────────────────
function useNotesState(initialData: NotesData, canSave: boolean) {
  const [data, dispatch] = useReducer(reducer, initialData)
  const saveStatus = useAutosave(data, canSave)

  const actions = useMemo(
    () => ({
      /** Yeni tab ekler, id'sini döndürür (hemen adlandırma moduna girmek için). */
      addTab: (title = getT()('tabs.new')) => {
        const id = crypto.randomUUID()
        dispatch({ type: 'addTab', id, title })
        return id
      },
      renameTab: (id: string, title: string) => dispatch({ type: 'renameTab', id, title }),
      deleteTab: (id: string) => dispatch({ type: 'deleteTab', id }),
      selectTab: (id: string) => dispatch({ type: 'selectTab', id }),
      reorderTabs: (ids: string[]) => dispatch({ type: 'reorderTabs', ids }),
      setTabColor: (id: string, color: TabColor | null) => dispatch({ type: 'setTabColor', id, color }),
      addSubtab: (tabId: string, title = getT()('subtabs.new')) => {
        const id = crypto.randomUUID()
        dispatch({ type: 'addSubtab', tabId, id, title })
        return id
      },
      renameSubtab: (tabId: string, id: string, title: string) =>
        dispatch({ type: 'renameSubtab', tabId, id, title }),
      deleteSubtab: (tabId: string, id: string) => dispatch({ type: 'deleteSubtab', tabId, id }),
      selectSubtab: (tabId: string, id: string) => dispatch({ type: 'selectSubtab', tabId, id }),
      reorderSubtabs: (tabId: string, ids: string[]) => dispatch({ type: 'reorderSubtabs', tabId, ids }),
      setBlockText: (tabId: string, subId: string, blockId: string, text: string) =>
        dispatch({ type: 'setBlockText', tabId, subId, blockId, text }),
      mergeBlockBack: (tabId: string, subId: string, blockId: string) =>
        dispatch({ type: 'mergeBlockBack', tabId, subId, blockId }),
      insertBlocks: (tabId: string, subId: string, at: number, blocks: Block[]) =>
        dispatch({ type: 'insertBlocks', tabId, subId, at, blocks }),
      insertBlocksAtCaret: (
        tabId: string,
        subId: string,
        blockId: string,
        from: number,
        to: number,
        blocks: Block[]
      ) => dispatch({ type: 'insertBlocksAtCaret', tabId, subId, blockId, from, to, blocks }),
      deleteBlock: (tabId: string, subId: string, blockId: string) =>
        dispatch({ type: 'deleteBlock', tabId, subId, blockId }),
      setImageOrient: (tabId: string, subId: string, blockId: string, orient: 'wide' | 'tall') =>
        dispatch({ type: 'setImageOrient', tabId, subId, blockId, orient }),
      patchLink: (tabId: string, subId: string, blockId: string, patch: LinkPatch) =>
        dispatch({ type: 'patchLink', tabId, subId, blockId, patch }),
      setBlocks: (tabId: string, subId: string, blocks: Block[]) =>
        dispatch({ type: 'setBlocks', tabId, subId, blocks })
    }),
    []
  )

  const activeTab = data.tabs.find((t) => t.id === data.activeTabId) ?? null
  const activeSubtab = activeTab?.subtabs.find((s) => s.id === activeTab.activeSubtabId) ?? null

  return { data, activeTab, activeSubtab, actions, saveStatus }
}

type NotesStore = ReturnType<typeof useNotesState>
const NotesContext = createContext<NotesStore | null>(null)

type LoadState = { data: NotesData; canSave: boolean } | null

// Panel kapanınca arayüz kaldırılıyor; veri kaybolmasın diye store panelin DIŞINDA (App'te) yaşıyor.
// Önce diskten yükler; yüklenene kadar hiçbir şey göstermez (yarım veriyle kayıt yapılmasın diye).
export function NotesProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<LoadState>(null)

  useEffect(() => {
    let cancelled = false // eski/yinelenen yükleme isteğinin sonucu yok sayılsın
    window.notes
      .load()
      .then(async (data) => {
        const d = data ?? (await seedData(true))
        if (!cancelled) setLoaded({ data: normalizeNotes(d), canSave: true })
      })
      .catch((e) => {
        // Dosya okunamadı (ör. izin hatası): örnek içerikle aç ama ASLA diske yazma,
        // yoksa diskteki gerçek notların üzerine yazılır.
        console.error('Notlar yüklenemedi:', e)
        // Diske dokunmamak için görselsiz örnek.
        if (!cancelled) void seedData(false).then((d) => setLoaded({ data: normalizeNotes(d), canSave: false }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!loaded) return null
  return (
    <LoadedNotesProvider initialData={loaded.data} canSave={loaded.canSave}>
      {children}
    </LoadedNotesProvider>
  )
}

function LoadedNotesProvider(props: { initialData: NotesData; canSave: boolean; children: ReactNode }) {
  const store = useNotesState(props.initialData, props.canSave)
  return <NotesContext.Provider value={store}>{props.children}</NotesContext.Provider>
}

export function useNotes(): NotesStore {
  const store = useContext(NotesContext)
  if (!store) throw new Error('useNotes, NotesProvider içinde kullanılmalı')
  return store
}
