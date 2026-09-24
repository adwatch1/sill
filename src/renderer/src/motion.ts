// Ortak animasyon ayarları — tüm arayüz aynı "yay" hissini paylaşsın.
import type { Transition } from 'framer-motion'

/** Seçim hapının kayması, öğelerin yer değiştirmesi. */
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 38, mass: 0.8 }

/** Panelin kenardan açılışı ve büyütülen görsel. */
export const springPanel: Transition = { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 }

/** Kart (ses / video) belirirken. */
export const cardEnter = { opacity: 0, scale: 0.96 }
export const cardVisible = { opacity: 1, scale: 1 }

/** Yeni öğe belirirken / silinirken. */
export const itemEnter = { opacity: 0, scale: 0.85 }
export const itemVisible = { opacity: 1, scale: 1 }
export const itemExit = { opacity: 0, scale: 0.85, transition: { duration: 0.15 } }
