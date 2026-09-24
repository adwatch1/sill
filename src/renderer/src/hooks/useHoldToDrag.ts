import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { useDragControls } from 'framer-motion'

const HOLD_MS = 250 // bu kadar basılı tutunca öğe "havaya kalkar" ve sürüklenebilir
const HOLD_TOLERANCE_PX = 6 // basılı tutarken bundan fazla kayarsa iptal (normal tıklama sayılır)

// "Basılı tut → havaya kalk → sürükle" davranışı. Tab'lar ve alt başlıklar ortak kullanır.
// Basılı tutmadan kaydırma sürükleme başlatmaz; tık ve çift tık bozulmaz.
// `bounds`: sürüklenen öğe bu kutunun (liste/ray) dışına çıkamaz, kenarda hafifçe esneyip durur.
export function useHoldToDrag(disabled: boolean, bounds: RefObject<HTMLElement | null>) {
  const dragControls = useDragControls()
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null)
  const [lifted, setLifted] = useState(false)

  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = null
  }

  // Havadayken fare bırakılınca (sürüklemeden bile) yere indir.
  useEffect(() => {
    if (!lifted) return
    const drop = () => setLifted(false)
    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', drop)
    return () => {
      window.removeEventListener('pointerup', drop)
      window.removeEventListener('pointercancel', drop)
    }
  }, [lifted])

  useEffect(() => cancelHold, [])

  /** Reorder.Item'a yayılacak özellikler. */
  const itemProps = {
    dragListener: false, // sürükleme sadece basılı tutunca başlasın
    dragControls,
    dragConstraints: bounds,
    dragElastic: 0.08,
    onPointerDown: (e: PointerEvent) => {
      if (disabled || e.button !== 0) return
      const event = e
      hold.current = {
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => {
          hold.current = null
          setLifted(true)
          dragControls.start(event)
        }, HOLD_MS)
      }
    },
    onPointerMove: (e: PointerEvent) => {
      const h = hold.current
      if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_TOLERANCE_PX) cancelHold()
    },
    onPointerUp: cancelHold,
    onPointerLeave: cancelHold,
    onDragEnd: () => setLifted(false)
  }

  return { lifted, itemProps }
}
