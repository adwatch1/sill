import { useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import { Play, X } from 'lucide-react'
import type { LinkBlock } from '../../../shared/notes'
import type { LinkPatch } from '../store/notesStore'
import { thumbUrl } from '../../../shared/media'
import { cardEnter, cardVisible, springSnappy } from '../motion'
import { useContextMenu } from './ContextMenu'
import styles from './LinkCard.module.css'

// Bu oturumda önizlemesi zaten istenmiş videolar. Kart her açılışta yeniden kuruluyor;
// başarılı bir cevaptan sonra tekrar tekrar sormayalım. İnternet yoksa ya da ayar kapalıysa
// listeye girmez: bir sonraki açılışta yeniden denenir ("internet gelince tamamlanır").
const done = new Set<string>()

/** Linki panoya kopyala. Tarayıcının pano iznine takılmayan eski ama sağlam yol. */
function copyText(text: string): void {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
}

interface Props {
  block: LinkBlock
  onDelete: (block: LinkBlock) => void
  onPatch: (patch: LinkPatch) => void
}

/** YouTube kartı: 16:9 küçük resim + oynat simgesi, altında başlık ve kanal. Tıklayınca tarayıcıda açılır. */
export function LinkCard({ block, onDelete, onPatch }: Props) {
  const openMenu = useContextMenu()
  const complete = Boolean(block.att && block.title)

  // Eksik önizlemeyi tamamla. İnternete arayüz değil arka plan çıkar (main/youtube.ts).
  // Kart kalksa da cevap işlenir: veri store'da yaşıyor, parça kalksa da güncellenir.
  // Sadece kurulurken ve kart eksik olduğu sürece çalışır, her yeniden çizimde değil.
  useEffect(() => {
    if (complete || done.has(block.id)) return
    void window.media.youTubePreview(block.videoId).then((r) => {
      if (!r.ok) {
        if (r.reason === 'invalid') done.add(block.id)
        return
      }
      done.add(block.id)
      // Sadece eksik alanları doldur; kaydedilmiş bir başlığın üzerine yazma.
      const patch: LinkPatch = {}
      if (!block.att && r.att) Object.assign(patch, { att: r.att, ext: r.ext })
      if (!block.title && r.title) patch.title = r.title
      if (!block.channel && r.channel) patch.channel = r.channel
      if (Object.keys(patch).length > 0) onPatch(patch)
    })
  }, [block.id, complete])

  const open = (): void => window.media.openYouTube(block.videoId, block.start)

  const remove = (e: ReactMouseEvent): void => {
    e.stopPropagation()
    onDelete(block)
  }

  return (
    <motion.div
      layout
      transition={springSnappy}
      initial={cardEnter}
      animate={cardVisible}
      className={styles.card}
      title={block.url}
      onClick={open}
      onContextMenu={(e) =>
        openMenu(e, [
          { type: 'item', label: 'Tarayıcıda aç', onSelect: open },
          { type: 'item', label: 'Linki kopyala', onSelect: () => copyText(block.url) },
          { type: 'separator' },
          { type: 'item', label: 'Videoyu sil', destructive: true, onSelect: () => onDelete(block) }
        ])
      }
    >
      <div className={styles.thumb}>
        {block.att && <img className={styles.image} src={thumbUrl(block.att)} alt="" draggable={false} />}
        <span className={styles.play}>
          <Play size={16} strokeWidth={0} fill="currentColor" className={styles.playIcon} />
        </span>
      </div>
      <div className={styles.meta}>
        <div className={styles.title}>{block.title ?? block.url}</div>
        <div className={styles.sub}>YouTube{block.channel ? ` · ${block.channel}` : ''}</div>
      </div>

      <button className={styles.remove} title="Videoyu sil" onClick={remove}>
        <X size={11} strokeWidth={3} />
      </button>
    </motion.div>
  )
}
