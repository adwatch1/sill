import { useEffect } from 'react'
import { motion } from 'framer-motion'
import styles from './ConfirmDialog.module.css'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
}

interface Props {
  request: ConfirmRequest
  onClose: () => void
}

// macOS "sheet" tarzı onay penceresi — panelin içinde açılır.
export function ConfirmDialog({ request, onClose }: Props) {
  const confirm = () => {
    request.onConfirm()
    onClose()
  }

  useEffect(() => {
    // "capture" ile önce biz yakalıyoruz: Esc sadece bu pencereyi kapatsın, paneli değil.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        confirm()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={onClose}
    >
      <motion.div
        className={styles.card}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 600, damping: 34 } }}
        exit={{ scale: 0.95, opacity: 0, transition: { duration: 0.12 } }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.title}>{request.title}</div>
        <div className={styles.message}>{request.message}</div>
        <div className={styles.buttons}>
          <button className={styles.button} onClick={onClose}>
            Vazgeç
          </button>
          <button className={`${styles.button} ${styles.destructive}`} onClick={confirm} autoFocus>
            {request.confirmLabel ?? 'Sil'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
