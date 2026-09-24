import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic } from 'lucide-react'
import { useNotes } from '../store/notesStore'
import {
  isAudioBlock,
  isImageBlock,
  isLinkBlock,
  isTextBlock,
  type AudioBlock,
  type Block,
  type ImageBlock,
  type LinkBlock,
  type TextBlock
} from '../../../shared/notes'
import { parseYouTube, type YouTubeRef } from '../../../shared/youtube'
import type { ImportResult } from '../../../shared/media'
import { MediaGrid } from './MediaGrid'
import { AudioPlayer, pauseAllAudio, probeDuration } from './AudioPlayer'
import { RecordBar } from './RecordBar'
import { LinkCard } from './LinkCard'
import { useRecorder, type RecordTarget } from '../hooks/useRecorder'
import { useContextMenu } from './ContextMenu'
import styles from './NoteView.module.css'
import { useI18n } from '../i18n'

/** Bu olay tetiklenince imleç not alanına gider (kısayolla açılışta kullanılır). */
export const FOCUS_EDITOR_EVENT = 'sill:focus-editor'

const TOAST_MS = 6000

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }

/** Verilen yönde ilk yazı bloğu (aradaki görsel/ses bloklarını atlayarak). */
function nearestTextBlock(blocks: Block[], from: number, step: number): TextBlock | null {
  for (let i = from; i >= 0 && i < blocks.length; i += step) {
    const b = blocks[i]
    if (isTextBlock(b)) return b
  }
  return null
}

/** Art arda gelen görseller tek ızgarada toplansın diye blokları öbekle. */
type Group =
  | { kind: 'text'; block: TextBlock; at: number }
  | { kind: 'grid'; items: ImageBlock[]; at: number }
  | { kind: 'audio'; block: AudioBlock; at: number }
  | { kind: 'link'; block: LinkBlock; at: number }
  | { kind: 'unknown'; block: Block; at: number }

function groupBlocks(blocks: Block[]): Group[] {
  const out: Group[] = []
  blocks.forEach((b, at) => {
    if (isImageBlock(b)) {
      const last = out[out.length - 1]
      if (last && last.kind === 'grid') last.items.push(b)
      else out.push({ kind: 'grid', items: [b], at })
    } else if (isTextBlock(b)) {
      out.push({ kind: 'text', block: b, at })
    } else if (isAudioBlock(b)) {
      out.push({ kind: 'audio', block: b, at })
    } else if (isLinkBlock(b)) {
      out.push({ kind: 'link', block: b, at })
    } else {
      out.push({ kind: 'unknown', block: b, at })
    }
  })
  return out
}

/** Yapıştırılan / bırakılan YouTube linkinden kart bloğu. Küçük resim ve başlık sonra gelir (LinkCard). */
function newLinkBlock(url: string, ref: YouTubeRef): LinkBlock {
  return {
    id: crypto.randomUUID(),
    type: 'link',
    provider: 'youtube',
    url: url.trim(),
    videoId: ref.videoId,
    ...(ref.start ? { start: ref.start } : {}),
    updatedAt: Date.now()
  }
}

/** Bir düzenlemeden sonra imlecin gideceği yer. offset < 0 → yazının sonu. */
type FocusRequest = { blockId: string; offset: number }
/**
 * Alt köşede beliren bilgi balonu. `undo` doluysa "Geri al" düğmesi çıkar;
 * `action` doluysa onun düğmesi (ör. "Ayarları aç").
 */
type Toast = { message: string; undo?: Block[]; action?: { label: string; run: () => void } }

// Seçili alt başlığın notu: başlık + blok listesi + alt bilgi.
// Not sıralı bloklardan oluşur: yazı · görsel · ses. Düz yazı notunda tek bir
// yazı bloğu vardır, yani görünüm eskisiyle birebir aynıdır.
export function NoteView() {
  const { activeTab, activeSubtab, actions, saveStatus } = useNotes()
  const openMenu = useContextMenu()
  const { t, locale } = useI18n()
  // Tarih biçimi dile göre (ör. "24 Eyl 22:27" / "Sep 24, 10:27 PM")
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, DATE_OPTS), [locale])

  // Hangi bloğun yazı kutusu nerede — imleci bloklar arasında taşımak için.
  const editors = useRef(new Map<string, HTMLTextAreaElement>())
  const [focusReq, setFocusReq] = useState<FocusRequest | null>(null)
  // Sürüklenen dosyanın hangi bloğun önüne düşeceği (kılavuz çizgisi burada çizilir).
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number | null>(null)
  // Kısayol dinleyicisi her tuşta yeniden kurulmasın diye bloklar ref'te de duruyor.
  const blocksRef = useRef<Block[]>([])
  const blocks = activeSubtab?.blocks ?? []
  blocksRef.current = blocks

  const register = useCallback((id: string, el: HTMLTextAreaElement | null) => {
    if (el) editors.current.set(id, el)
    else editors.current.delete(id)
  }, [])

  const putCaret = useCallback((blockId: string, offset: number) => {
    const el = editors.current.get(blockId)
    if (!el) return
    el.focus()
    const at = offset < 0 ? el.value.length : Math.min(offset, el.value.length)
    el.setSelectionRange(at, at)
  }, [])

  const showToast = useCallback((message: string, undo?: Block[], action?: Toast['action']) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast({ message, undo, action })
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  // ── Mikrofonla kayıt ────────────────────────────────────
  // Kayıt bitince ses, kaydın BAŞLADIĞI alt başlığa konur (bu arada başka yere geçilse bile).
  const recorder = useRecorder({
    onDone: async (target: RecordTarget, bytes: Uint8Array, durationMs: number) => {
      const name = t('rec.name', { date: dateFormat.format(Date.now()) })
      const r = await window.media.importBytes(bytes, name)
      if (!r.ok) {
        showToast(r.message)
        return
      }
      const block: AudioBlock = {
        id: crypto.randomUUID(),
        type: 'audio',
        att: r.att,
        ext: r.ext,
        name,
        // webm dosyası süresini içinde taşımıyor, sonradan okunamıyor: kayıt anında yazıyoruz.
        durationMs,
        updatedAt: Date.now()
      }
      const { tabId: tid, subId: sid, caret } = target
      if (caret) actions.insertBlocksAtCaret(tid, sid, caret.blockId, caret.from, caret.to, [block])
      else actions.insertBlocks(tid, sid, -1, [block]) // notun sonuna
    },
    onError: (err) =>
      showToast(
        err.message,
        undefined,
        err.openSettings ? { label: t('toast.openSettings'), run: window.media.openMicSettings } : undefined
      )
  })
  const recording = recorder.state !== 'idle'
  const stopRecording = recorder.stop

  // Alt başlık değişince kayıt biter (ve başladığı yere kaydedilir).
  const currentSubId = activeSubtab?.id
  useEffect(() => {
    stopRecording()
  }, [currentSubId, stopRecording])

  // Kayıt sürerken Esc: önce kaydı bitirir, paneli kapatmaz. document üzerinde dinliyoruz ki
  // açık bir menü (pencerede, daha önce yakalıyor) Esc'i önce kendisi alabilsin.
  useEffect(() => {
    if (recorder.state !== 'recording') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      stopRecording()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [recorder.state, stopRecording])

  const startRecording = (target: RecordTarget): void => {
    pauseAllAudio() // kayıt sırasında hoparlörden ses gelmesin
    void recorder.start(target)
  }

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
  }, [])

  // İmleç isteği render'dan SONRA uygulanır: hedef blok o ana kadar ekranda olmayabilir.
  useLayoutEffect(() => {
    if (!focusReq) return
    putCaret(focusReq.blockId, focusReq.offset)
    setFocusReq(null)
  }, [focusReq, putCaret])

  // Kısayolla açılışta imleç son yazı bloğunun sonuna gitsin.
  useEffect(() => {
    const focus = (): void => {
      const last = [...blocksRef.current].reverse().find(isTextBlock)
      if (last) putCaret(last.id, -1)
    }
    window.addEventListener(FOCUS_EDITOR_EVENT, focus)
    return () => window.removeEventListener(FOCUS_EDITOR_EVENT, focus)
  }, [putCaret])

  if (!activeTab) return null

  if (!activeSubtab) {
    return (
      <main className={styles.empty}>
        <p>{t('note.noSubtabs')}</p>
        <button className={styles.emptyButton} onClick={() => actions.addSubtab(activeTab.id, t('subtabs.new'))}>
          {t('note.addSubtab')}
        </button>
      </main>
    )
  }

  const tabId = activeTab.id
  const subId = activeSubtab.id
  const groups = groupBlocks(blocks)

  /** Bloklar arası gezinme ve birleşme. */
  const handleKeyDown = (
    e: ReactKeyboardEvent<HTMLTextAreaElement>,
    block: TextBlock,
    i: number
  ): void => {
    const el = e.currentTarget
    const collapsed = el.selectionStart === el.selectionEnd
    const atStart = collapsed && el.selectionStart === 0
    const atEnd = collapsed && el.selectionStart === el.value.length
    const prev = blocks[i - 1]

    if (e.key === 'Backspace' && atStart && prev && isTextBlock(prev)) {
      // En baştaki Backspace önceki yazı bloğuyla birleştirir; imleç birleşme noktasına gider.
      // Araya görsel girmişse birleşme olmaz — o bir silme işidir, rozetiyle yapılır.
      e.preventDefault()
      setFocusReq({ blockId: prev.id, offset: prev.text.length })
      actions.mergeBlockBack(tabId, subId, block.id)
      return
    }
    // Oklar aradaki görsel bloklarının ÜZERİNDEN atlayıp bir sonraki yazıya geçer.
    if (e.key === 'ArrowUp' && atStart) {
      const target = nearestTextBlock(blocks, i - 1, -1)
      if (target) {
        e.preventDefault()
        putCaret(target.id, -1)
      }
      return
    }
    if (e.key === 'ArrowDown' && atEnd) {
      const target = nearestTextBlock(blocks, i + 1, 1)
      if (target) {
        e.preventDefault()
        putCaret(target.id, 0)
      }
    }
  }

  /** Notun boş kalan alanına tıklayınca imleç son yazı bloğuna gitsin. */
  const focusLastOnBackdrop = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return
    const last = [...blocks].reverse().find(isTextBlock)
    if (!last) return
    e.preventDefault()
    putCaret(last.id, -1)
  }

  // ── Görsel / ses ekleme (sürükle-bırak · yapıştır · dosya seç) ─────────

  /**
   * İçeri alma sonuçlarını bloklara çevir; ilk hatayı balonla bildir.
   * Seslerin süresi burada okunur. Oynatıcının açamadığı bir ses (ör. desteklenmeyen bir kodek)
   * nota hiç girmez — bozuk bir kart koymaktansa hemen söylemek daha dürüst.
   */
  const toBlocks = async (results: ImportResult[]): Promise<Block[]> => {
    let problem = results.find((r) => !r.ok)?.message
    const now = Date.now()
    const out: Block[] = []
    for (const r of results) {
      if (!r.ok) continue
      const base = { id: crypto.randomUUID(), att: r.att, ext: r.ext, name: r.name, updatedAt: now }
      if (r.kind === 'image') {
        out.push({ ...base, type: 'image', w: r.w, h: r.h })
        continue
      }
      const ms = await probeDuration(r.att, r.ext)
      if (ms === null) {
        problem ??= t('toast.cantPlay', { name: r.name })
        continue
      }
      out.push({ ...base, type: 'audio', ...(ms !== undefined ? { durationMs: ms } : {}) })
    }
    if (problem) showToast(problem)
    return out
  }

  const hasFiles = (e: ReactDragEvent): boolean => Array.from(e.dataTransfer.types).includes('Files')

  /** Fare hangi bloğun önündeyse oraya düşecek: blokların orta çizgisine bakıyoruz. */
  const computeDropAt = (e: ReactDragEvent<HTMLDivElement>): number => {
    const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-at]'))
    for (const n of nodes) {
      const r = n.getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) return Number(n.dataset.at)
    }
    return blocks.length
  }

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setDropAt(computeDropAt(e))
  }

  const onDragLeave = (e: ReactDragEvent<HTMLDivElement>): void => {
    // Alt öğeler arasında gezinirken kılavuz kaybolmasın.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDropAt(null)
  }

  const onDrop = async (e: ReactDragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    const at = dropAt ?? blocks.length
    setDropAt(null)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) {
      // Tarayıcıdan sürüklenen YouTube linki (adres çubuğundan ya da sayfadaki bir linkten).
      const url = e.dataTransfer.getData('text/uri-list').split('\n')[0] || e.dataTransfer.getData('text/plain')
      const ref = parseYouTube(url)
      if (ref) actions.insertBlocks(tabId, subId, computeDropAt(e), [newLinkBlock(url, ref)])
      return
    }

    const added = await toBlocks(await window.media.importPaths(window.media.pathsFor(files)))
    if (added.length > 0) actions.insertBlocks(tabId, subId, at, added)
  }

  // ── Yapıştırma ve "Görsel ekle…" ───────────────────────

  /**
   * Ctrl+V. Panoda dosya/görsel yoksa hiç karışmıyoruz — Windows'un kendi yazı
   * yapıştırması çalışır. Görsel varsa iki kaynak olabilir:
   *   • Gezgin'de kopyalanmış bir dosya → diskte yolu var, onu okuyoruz (adı korunur).
   *   • Ekran görüntüsü → diskte dosyası yok, baytlarını arka plana gönderiyoruz.
   */
  const onPaste = async (
    e: ReactClipboardEvent<HTMLTextAreaElement>,
    block: TextBlock
  ): Promise<void> => {
    const files = Array.from(e.clipboardData.files)
    // Olay nesnesi await'ten sonra boşalıyor; imleç konumunu şimdi alıyoruz.
    const el = e.currentTarget
    const from = el.selectionStart
    const to = el.selectionEnd

    if (files.length === 0) {
      // Tek başına bir YouTube linki → video kartı. Cümle içindeki link yazı olarak kalır.
      const text = e.clipboardData.getData('text/plain')
      const ref = parseYouTube(text)
      if (!ref) return // normal yazı yapıştırması — karışmıyoruz
      e.preventDefault()
      const before = blocks
      actions.insertBlocksAtCaret(tabId, subId, block.id, from, to, [newLinkBlock(text, ref)])
      // Kart istenmediyse: yapıştırmadan önceki hâle dön ve linki yazı olarak koy.
      const asText = before.map((b) =>
        b.id === block.id && isTextBlock(b)
          ? { ...b, text: b.text.slice(0, from) + text.trim() + b.text.slice(to), updatedAt: Date.now() }
          : b
      )
      showToast(t('toast.videoAdded'), undefined, {
        label: t('toast.keepAsText'),
        run: () => {
          actions.setBlocks(tabId, subId, asText)
          setFocusReq({ blockId: block.id, offset: from + text.trim().length })
        }
      })
      return
    }
    e.preventDefault()

    const paths = window.media.pathsFor(files).filter(Boolean)
    const results =
      paths.length === files.length
        ? await window.media.importPaths(paths)
        : await Promise.all(
            files.map(async (f) =>
              window.media.importBytes(new Uint8Array(await f.arrayBuffer()), f.name)
            )
          )

    const added = await toBlocks(results)
    if (added.length > 0) actions.insertBlocksAtCaret(tabId, subId, block.id, from, to, added)
  }

  /** Sağ tık → "Görsel ekle…" / "Ses ekle…": dosya seçme penceresi arka planda açılır. */
  const pickMedia = async (
    kind: 'image' | 'audio',
    blockId: string,
    from: number,
    to: number
  ): Promise<void> => {
    const added = await toBlocks(await window.media.pick(kind))
    if (added.length > 0) actions.insertBlocksAtCaret(tabId, subId, blockId, from, to, added)
  }

  const deleteMedia = (b: ImageBlock | AudioBlock | LinkBlock): void => {
    const before = blocks // silmeden önceki hâli sakla: "Geri al" bunu geri koyar
    actions.deleteBlock(tabId, subId, b.id)
    showToast(t(b.type === 'audio' ? 'toast.audioDeleted' : b.type === 'link' ? 'toast.videoDeleted' : 'toast.imageDeleted'), before)
  }

  const undoDelete = (): void => {
    if (toast?.undo) actions.setBlocks(tabId, subId, toast.undo)
    setToast(null)
  }

  const openEditMenu = (e: ReactMouseEvent<HTMLTextAreaElement>, block: TextBlock): void => {
    const el = e.currentTarget
    const hasSelection = el.selectionStart !== el.selectionEnd
    // Menü açılınca imleç konumu değişebilir; şimdiki hâlini saklıyoruz.
    const from = el.selectionStart
    const to = el.selectionEnd
    const edit = (cmd: Parameters<typeof window.panel.edit>[0]) => () => {
      el.focus()
      window.panel.edit(cmd)
    }
    openMenu(e, [
      { type: 'item', label: t('menu.undo'), shortcut: 'Ctrl+Z', onSelect: edit('undo') },
      { type: 'separator' },
      { type: 'item', label: t('menu.cut'), shortcut: 'Ctrl+X', disabled: !hasSelection, onSelect: edit('cut') },
      { type: 'item', label: t('menu.copy'), shortcut: 'Ctrl+C', disabled: !hasSelection, onSelect: edit('copy') },
      // Yapıştır yine Windows'un komutu: panoda görsel varsa yazı alanında `paste`
      // olayı tetikleniyor ve yukarıdaki onPaste onu yakalıyor.
      { type: 'item', label: t('menu.paste'), shortcut: 'Ctrl+V', onSelect: edit('paste') },
      { type: 'separator' },
      { type: 'item', label: t('menu.selectAll'), shortcut: 'Ctrl+A', onSelect: edit('selectAll') },
      { type: 'separator' },
      { type: 'item', label: t('menu.addImage'), onSelect: () => void pickMedia('image', block.id, from, to) },
      { type: 'item', label: t('menu.addAudio'), onSelect: () => void pickMedia('audio', block.id, from, to) },
      {
        type: 'item',
        label: t('menu.record'),
        disabled: recording,
        onSelect: () => startRecording({ tabId, subId, caret: { blockId: block.id, from, to } })
      }
    ])
  }

  const single = blocks.length === 1 && isTextBlock(blocks[0])

  return (
    <main className={styles.note}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={subId}
          className={`${styles.page} ${dropAt !== null ? styles.dropping : ''}`}
          onMouseDown={focusLastOnBackdrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
        >
          <h1 className={styles.title}>{activeSubtab.title}</h1>

          {groups.map((g) => (
            <Fragment key={g.kind === 'grid' ? `grid-${g.items[0].id}` : g.block.id}>
              {dropAt === g.at && <div className={styles.dropLine} />}
              {g.kind === 'text' ? (
                <TextBlockEditor
                  at={g.at}
                  block={g.block}
                  placeholder={single ? t('note.placeholder') : undefined}
                  onRegister={register}
                  onChange={(text) => actions.setBlockText(tabId, subId, g.block.id, text)}
                  onKeyDown={(e) => handleKeyDown(e, g.block, g.at)}
                  onPaste={(e) => void onPaste(e, g.block)}
                  onContextMenu={(e) => openEditMenu(e, g.block)}
                />
              ) : g.kind === 'grid' ? (
                <div data-at={g.at}>
                  <MediaGrid
                    items={g.items}
                    onOpen={(b) => window.media.openLightbox(b.att, b.ext, b.name)}
                    onDelete={deleteMedia}
                    onOrient={(b, orient) => actions.setImageOrient(tabId, subId, b.id, orient)}
                  />
                </div>
              ) : g.kind === 'audio' ? (
                <div data-at={g.at}>
                  <AudioPlayer block={g.block} onDelete={deleteMedia} />
                </div>
              ) : g.kind === 'link' ? (
                <div data-at={g.at}>
                  <LinkCard
                    block={g.block}
                    onDelete={deleteMedia}
                    onPatch={(patch) => actions.patchLink(tabId, subId, g.block.id, patch)}
                  />
                </div>
              ) : (
                // Tanınmayan blok (daha yeni bir sürümden). Gösteremiyoruz ama dosyada duruyor.
                <div
                  data-at={g.at}
                  className={styles.unknown}
                  title={t('note.unknownBlockTitle', { type: g.block.type })}
                >
                  {t('note.unknownBlock')}
                </div>
              )}
            </Fragment>
          ))}
          {dropAt === blocks.length && <div className={styles.dropLine} />}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className={styles.toast}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.16 }}
          >
            <span>{toast.message}</span>
            {toast.undo && (
              <button className={styles.toastButton} onClick={undoDelete}>
                {t('toast.undo')}
              </button>
            )}
            {toast.action && (
              <button
                className={styles.toastButton}
                onClick={() => {
                  toast.action?.run()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {recorder.state === 'recording' && (
          <RecordBar
            elapsed={recorder.elapsed}
            analyser={recorder.analyser}
            devices={recorder.devices}
            chosenId={recorder.chosenId}
            onStop={recorder.stop}
            onCancel={recorder.cancel}
            onSelectMic={(id) => void recorder.selectMic(id)}
          />
        )}
      </AnimatePresence>

      <footer className={styles.footer}>
        {saveStatus === 'saved' && <span>{t('note.edited', { date: dateFormat.format(activeSubtab.updatedAt) })}</span>}
        {saveStatus === 'error' && <span className={styles.warn}>{t('note.saveError')}</span>}
        {saveStatus === 'disabled' && (
          <span className={styles.warn}>{t('note.loadError')}</span>
        )}
        <button
          className={styles.micButton}
          title={t('menu.record')}
          disabled={recording}
          onClick={() => startRecording({ tabId, subId })}
        >
          <Mic size={14} strokeWidth={2} />
        </button>
      </footer>
    </main>
  )
}

interface TextBlockProps {
  at: number
  block: TextBlock
  placeholder?: string
  onRegister: (id: string, el: HTMLTextAreaElement | null) => void
  onChange: (text: string) => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (e: ReactClipboardEvent<HTMLTextAreaElement>) => void
  onContextMenu: (e: ReactMouseEvent<HTMLTextAreaElement>) => void
}

/** Yazı bloğu: içeriği kadar uzayan yazı kutusu. Kaydırma artık notun tamamında. */
function TextBlockEditor({
  at,
  block,
  placeholder,
  onRegister,
  onChange,
  onKeyDown,
  onPaste,
  onContextMenu
}: TextBlockProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Yazı uzayınca kutu da uzasın: önce sıfırla, sonra gerçek içerik boyuna ayarla.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [block.text])

  useEffect(() => {
    onRegister(block.id, ref.current)
    return () => onRegister(block.id, null)
  }, [block.id, onRegister])

  return (
    <textarea
      ref={ref}
      data-at={at}
      className={styles.editor}
      value={block.text}
      placeholder={placeholder}
      spellCheck={false}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onContextMenu={onContextMenu}
    />
  )
}
