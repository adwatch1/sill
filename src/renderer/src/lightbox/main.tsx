import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence, motion } from 'framer-motion'
import { springPanel } from '../motion'
import { X } from 'lucide-react'
import '@fontsource-variable/inter'
import type { LightboxItem } from '../../../preload/lightbox'
import './lightbox.css'
import { setLanguagePref, useI18n } from '../i18n'
import type { LangPref } from '../../../shared/i18n'

declare global {
  interface Window {
    lightbox: import('../../../preload/lightbox').LightboxApi
  }
}

/** Ekranı kaplayan büyütme görünümü: karartılmış zemin, ortada görsel, X ve Esc ile kapanır. */
function Lightbox() {
  const { t } = useI18n()
  const [item, setItem] = useState<LightboxItem | null>(null)

  useEffect(() => {
    const off = window.lightbox.onShow((it) => {
      if (it.lang) setLanguagePref(it.lang as LangPref)
      setItem(it)
    })
    window.lightbox.ready() // "kuruldum, gönder ve pencereyi göster"
    return off
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.lightbox.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <motion.div
      className="backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.14 }}
      onMouseDown={() => window.lightbox.close()}
    >
      <button className="close" title={t('lightbox.close')} onClick={() => window.lightbox.close()}>
        <X size={18} strokeWidth={2.2} />
      </button>

      <AnimatePresence>
        {item && (
          <motion.img
            key={item.src}
            className="image"
            src={item.src}
            alt={item.name ?? t('image.alt')}
            draggable={false}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPanel}
            onMouseDown={(e) => e.stopPropagation()}
          />
        )}
      </AnimatePresence>

      {item?.name && <div className="caption">{item.name}</div>}
    </motion.div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lightbox />
  </StrictMode>
)
