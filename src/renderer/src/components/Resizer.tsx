import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import styles from './Resizer.module.css'

interface Props {
  /**
   * Şu anki genişliği sürükleme BAŞLARKEN okur.
   * Prop yerine fonksiyon: panel genişliği bilerek React durumunda tutulmuyor (bkz. App.tsx).
   */
  getValue: () => number
  min: number
  max: number
  /** Çift tıklayınca dönülecek genişlik. */
  reset: number
  /** true: sola sürükleyince BÜYÜR (panelin sol kenarı için). */
  invert?: boolean
  onChange: (value: number) => void
  /** Sürükleme bitti. */
  onCommit?: () => void
  /** Sürükleme başladı / bitti (tab çubuğunun konum düzeltmelerini dondurmak için). */
  onDragging?: (dragging: boolean) => void
  title: string
  className?: string
}

/**
 * İnce, görünmez bir sürükleme şeridi. Üzerine gelince ince bir çizgi beliriyor (macOS gibi).
 *
 * `screenX` kullanıyoruz, `clientX` değil: panelin sol kenarı sürüklenirken **pencerenin kendisi
 * de hareket ediyor**, o yüzden pencereye göre ölçüm kendi kendini besleyen bir hataya dönüşür.
 * Ekrana göre ölçüm bundan etkilenmiyor.
 */
export function Resizer({
  getValue,
  min,
  max,
  reset,
  invert,
  onChange,
  onCommit,
  onDragging,
  title,
  className
}: Props) {
  const start = useRef<{ x: number; w: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId) // fare şeritten çıksa da olayları almaya devam et
    start.current = { x: e.screenX, w: getValue() }
    setDragging(true)
    onDragging?.(true)
  }

  const move = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = start.current
    if (!s) return
    const delta = e.screenX - s.x
    onChange(Math.min(max, Math.max(min, Math.round(s.w + (invert ? -delta : delta)))))
  }

  const up = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!start.current) return
    start.current = null
    setDragging(false)
    onDragging?.(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
    onCommit?.()
  }

  return (
    <div
      className={`${styles.handle} ${className ?? ''} ${dragging ? styles.dragging : ''}`}
      title={title}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => {
        onChange(reset)
        onCommit?.()
      }}
    />
  )
}
