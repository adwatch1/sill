import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { imageOrient, type ImageBlock } from '../../../shared/notes'
import { attUrl, thumbUrl } from '../../../shared/media'
import { springSnappy } from '../motion'
import { useContextMenu } from './ContextMenu'
import styles from './MediaGrid.module.css'

interface Props {
  items: ImageBlock[]
  onOpen: (block: ImageBlock) => void
  onDelete: (block: ImageBlock) => void
  onOrient: (block: ImageBlock, orient: 'wide' | 'tall') => void
}

/**
 * Art arda gelen görseller tek bir ızgarada toplanır.
 * Izgara **2 sütunlu kare hücrelerden** oluşur:
 *   yatay foto → iki kareyi yan yana alır (tam genişlik)
 *   dikey foto → iki kareyi alt alta alır (yarım genişlik, çift boy)
 * Böylece iki dikey foto yan yana gelince tam bir kare blok oluyor.
 */
export function MediaGrid({ items, onOpen, onDelete, onOrient }: Props) {
  return (
    <div className={styles.grid}>
      {items.map((block) => (
        <Tile key={block.id} block={block} onOpen={onOpen} onDelete={onDelete} onOrient={onOrient} />
      ))}
    </div>
  )
}

function Tile({ block, onOpen, onDelete, onOrient }: { block: ImageBlock } & Omit<Props, 'items'>) {
  const orient = imageOrient(block)
  // Önizleme üretilememişse (ör. nativeImage dosyayı açamadıysa) orijinali göster.
  const [src, setSrc] = useState(thumbUrl(block.att))
  const openMenu = useContextMenu()

  const remove = (e: ReactMouseEvent): void => {
    e.stopPropagation()
    onDelete(block)
  }

  return (
    <motion.div
      layout
      transition={springSnappy}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`${styles.tile} ${orient === 'wide' ? styles.wide : styles.tall}`}
      onClick={() => onOpen(block)}
      onContextMenu={(e) =>
        openMenu(e, [
          {
            type: 'item',
            label: orient === 'wide' ? 'Dikey yerleştir' : 'Yatay yerleştir',
            onSelect: () => onOrient(block, orient === 'wide' ? 'tall' : 'wide')
          },
          { type: 'separator' },
          { type: 'item', label: 'Görseli sil', destructive: true, onSelect: () => onDelete(block) }
        ])
      }
    >
      <img
        className={styles.image}
        src={src}
        alt={block.name ?? 'Görsel'}
        draggable={false}
        onError={() => setSrc(attUrl(block.att, block.ext))}
      />
      {/* Launchpad tarzı silme rozeti — tab'lardaki ile aynı dil. */}
      <button className={styles.remove} title="Görseli sil" onClick={remove}>
        <X size={11} strokeWidth={3} />
      </button>
    </motion.div>
  )
}
