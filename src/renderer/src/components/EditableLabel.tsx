import { useEffect, useRef, useState } from 'react'
import styles from './EditableLabel.module.css'

interface Props {
  value: string
  editing: boolean
  onCommit: (value: string) => void
  onDone: () => void
  className?: string
}

// Normalde düz yazı; editing=true olunca yazı kutusuna dönüşür.
// Enter veya dışarı tıklama → kaydet · Esc → vazgeç · boş bırakılırsa eski isim kalır.
export function EditableLabel({ value, editing, onCommit, onDone, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)
  const finished = useRef(false)

  useEffect(() => {
    if (!editing) return
    finished.current = false
    setDraft(value)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    // Sadece düzenleme başlarken çalışsın.
  }, [editing])

  if (!editing) return <span className={`${styles.label} ${className ?? ''}`}>{value}</span>

  // Enter ve blur aynı anda tetiklenebilir; sadece ilki işlesin.
  const finish = (save: boolean) => {
    if (finished.current) return
    finished.current = true
    const title = draft.trim()
    if (save && title && title !== value) onCommit(title)
    onDone()
  }

  return (
    <input
      ref={inputRef}
      className={`${styles.input} ${className ?? ''}`}
      value={draft}
      maxLength={60}
      style={{ width: `${Math.max(draft.length, 3) + 1}ch` }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') {
          e.stopPropagation() // Esc sadece düzenlemeyi iptal etsin, paneli kapatmasın
          finish(false)
        }
      }}
    />
  )
}
