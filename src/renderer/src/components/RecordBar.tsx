import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Mic, Trash2 } from 'lucide-react'
import type { MicDevice } from '../hooks/useRecorder'
import { useContextMenu } from './ContextMenu'
import { formatTime } from './AudioPlayer'
import { springSnappy } from '../motion'
import styles from './RecordBar.module.css'
import { useI18n } from '../i18n'


interface Props {
  elapsed: number
  analyser: AnalyserNode | null
  devices: MicDevice[]
  /** Seçilen mikrofon; '' = Windows varsayılanı. */
  chosenId: string
  onStop: () => void
  onCancel: () => void
  onSelectMic: (id: string) => void
}

/**
 * Kayıt çubuğu (WhatsApp sesli mesaj hissi): kırmızı nokta · süre · canlı dalga ·
 * mikrofon seçimi · at · durdur. Notun altında, alt bilginin hemen üstünde durur.
 */
export function RecordBar({ elapsed, analyser, devices, chosenId, onStop, onCancel, onSelectMic }: Props) {
  const openMenu = useContextMenu()
  const { t } = useI18n()
  // Seçilen mikrofon artık takılı değilse kayıt Windows varsayılanına düşmüştür; onay da oraya.
  const chosen = devices.find((d) => d.id === chosenId)
  const current = chosen ? chosen.id : ''

  const micMenu = (e: ReactMouseEvent): void => {
    openMenu(e, [
      { type: 'item', label: t('rec.micDefault'), checked: current === '', onSelect: () => onSelectMic('') },
      { type: 'separator' },
      ...devices.map((d) => ({
        type: 'item' as const,
        label: d.label,
        checked: d.id === current,
        onSelect: () => onSelectMic(d.id)
      }))
    ])
  }

  return (
    <motion.div
      className={styles.bar}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.12 } }}
      transition={springSnappy}
    >
      <span className={styles.dot} aria-hidden />
      <span className={styles.time}>{formatTime(elapsed / 1000)}</span>
      <Wave analyser={analyser} />

      <button className={styles.mic} title={chosen ? chosen.label : t('rec.micTitleDefault')} onClick={micMenu}>
        <Mic size={13} strokeWidth={2} />
        <ChevronDown size={11} strokeWidth={2.5} />
      </button>
      <button className={styles.icon} title={t('rec.cancel')} onClick={onCancel}>
        <Trash2 size={14} strokeWidth={2} />
      </button>
      <button className={styles.stop} title={t('rec.stop')} onClick={onStop}>
        <span className={styles.square} />
      </button>
    </motion.div>
  )
}

/** Bir çubuğun genişliği + aralık (CSS piksel). */
const STEP = 3
const BAR = 2
/** Yeni çubuk ne sıklıkla eklensin (ms). Daha sık → şerit daha hızlı akar. */
const SAMPLE_MS = 60

/**
 * Canlı dalga şeridi: sağdan yeni çubuklar girer, eskiler sola akar.
 * Her çubuk o anki ses yüksekliği (RMS). Kare kare çiziliyor, React yeniden çizimine girmiyor.
 */
function Wave({ analyser }: { analyser: AnalyserNode | null }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !analyser) return
    const g = canvas.getContext('2d')
    if (!g) return
    const buf = new Float32Array(analyser.fftSize)
    const levels: number[] = []
    let last = 0
    let raf = 0

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      if (now - last < SAMPLE_MS) return
      last = now

      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      // Konuşma sesi genelde çok alçak çıkar; karekök ile büyütüp sınırlıyoruz.
      levels.push(Math.min(1, Math.sqrt(Math.sqrt(sum / buf.length)) * 1.6))

      // Pencere boyu değişebilir (kenardan boyutlandırma): her karede ölç.
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr)
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr)
      const max = Math.ceil(w / STEP)
      if (levels.length > max) levels.splice(0, levels.length - max)

      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      g.fillStyle = getComputedStyle(canvas).color
      for (let i = 0; i < levels.length; i++) {
        const bh = Math.max(2, levels[i] * h)
        const x = w - (levels.length - i) * STEP
        g.fillRect(x, (h - bh) / 2, BAR, bh)
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [analyser])

  return <canvas ref={ref} className={styles.wave} />
}
