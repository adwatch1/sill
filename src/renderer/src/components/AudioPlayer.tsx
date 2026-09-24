import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import { Pause, Play, X } from 'lucide-react'
import type { AudioBlock } from '../../../shared/notes'
import { attUrl } from '../../../shared/media'
import { cardEnter, cardVisible, springSnappy } from '../motion'
import { useContextMenu } from './ContextMenu'
import styles from './AudioPlayer.module.css'

// Panel kapanınca arayüz kaldırılıyor ve ses duruyor. Açınca kaldığı
// yerden devam edilebilsin diye her sesin konumu burada, bellekte tutuluyor. Diske yazılmaz:
// program kapanınca başa döner.
const positions = new Map<string, number>()
// Aynı anda tek ses çalar: yenisi başlayınca öncekini durdururuz.
let playing: HTMLAudioElement | null = null

/** Çalan sesi duraklat (ör. mikrofon kaydı başlarken). */
export function pauseAllAudio(): void {
  playing?.pause()
}

/** 0:42 · 11:30 · 1:02:05 */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * Sesin süresini dosyadan oku (ekleme anında bloğa yazılsın diye).
 * Dosya çalınamıyorsa `null`, bir sebepten geç kaldıysa `undefined` döner.
 */
export function probeDuration(att: string, ext: string): Promise<number | null | undefined> {
  return new Promise((resolve) => {
    const a = new Audio()
    const done = (v: number | null | undefined): void => {
      window.clearTimeout(timer)
      a.onloadedmetadata = a.onerror = null
      a.removeAttribute('src')
      a.load() // dosya bağlantısını bırak
      resolve(v)
    }
    const timer = window.setTimeout(() => done(undefined), 5000)
    a.preload = 'metadata'
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : undefined)
    a.onerror = () => done(null)
    a.src = attUrl(att, ext)
  })
}

interface Props {
  block: AudioBlock
  onDelete: (block: AudioBlock) => void
}

/** Ses bloğu: tam genişlikte sade bir kart — oynat düğmesi, ad, ilerleme çubuğu, süre. */
export function AudioPlayer({ block, onDelete }: Props) {
  const ref = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [time, setTime] = useState(positions.get(block.id) ?? 0)
  const [duration, setDuration] = useState((block.durationMs ?? 0) / 1000)
  const [broken, setBroken] = useState(false)
  const openMenu = useContextMenu()

  // Kart kalkarken (panel kapanırken, alt başlık değişirken, silinince) sesi durdur ve
  // konumu sakla.
  useEffect(() => {
    const a = ref.current
    return () => {
      if (!a) return
      positions.set(block.id, a.ended ? 0 : a.currentTime)
      a.pause()
      if (playing === a) playing = null
    }
  }, [block.id])

  // Çalarken çubuk akıcı ilerlesin: `timeupdate` saniyede ~4 kez geliyor, kare kare okuyoruz.
  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    const tick = (): void => {
      if (ref.current) setTime(ref.current.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  const toggle = (): void => {
    const a = ref.current
    if (!a || broken) return
    if (a.paused) {
      if (playing && playing !== a) playing.pause()
      playing = a
      void a.play().catch(() => setBroken(true))
    } else {
      a.pause()
    }
  }

  const seek = (v: number): void => {
    const a = ref.current
    if (!a) return
    a.currentTime = v
    setTime(v)
  }

  const remove = (e: ReactMouseEvent): void => {
    e.stopPropagation()
    onDelete(block)
  }

  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0
  const name = block.name ?? 'Ses'

  return (
    <motion.div
      layout
      transition={springSnappy}
      initial={cardEnter}
      animate={cardVisible}
      className={styles.card}
      onContextMenu={(e) =>
        openMenu(e, [{ type: 'item', label: 'Sesi sil', destructive: true, onSelect: () => onDelete(block) }])
      }
    >
      <audio
        ref={ref}
        src={attUrl(block.att, block.ext)}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const a = e.currentTarget
          if (Number.isFinite(a.duration)) setDuration(a.duration)
          const saved = positions.get(block.id)
          if (saved) a.currentTime = saved
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={(e) => {
          setIsPlaying(false)
          setTime(e.currentTarget.currentTime)
        }}
        onEnded={(e) => {
          e.currentTarget.currentTime = 0
          setTime(0)
        }}
        onError={() => setBroken(true)}
      />

      <button
        className={styles.play}
        title={isPlaying ? 'Duraklat' : 'Oynat'}
        disabled={broken}
        onClick={toggle}
      >
        {isPlaying ? (
          <Pause size={13} strokeWidth={0} fill="currentColor" />
        ) : (
          <Play size={13} strokeWidth={0} fill="currentColor" className={styles.playIcon} />
        )}
      </button>

      <div className={styles.body}>
        <div className={styles.name} title={name}>
          {name}
        </div>
        {broken ? (
          <div className={styles.error}>Bu ses çalınamıyor</div>
        ) : (
          <div className={styles.row}>
            <input
              className={styles.seek}
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={Math.min(time, duration || 0)}
              style={{ '--p': `${progress}%` } as CSSProperties}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Konum"
            />
            <span className={styles.time}>
              {formatTime(time)} / {formatTime(duration)}
            </span>
          </div>
        )}
      </div>

      {/* Launchpad tarzı silme rozeti — görsellerdeki ile aynı dil. */}
      <button className={styles.remove} title="Sesi sil" onClick={remove}>
        <X size={11} strokeWidth={3} />
      </button>
    </motion.div>
  )
}
