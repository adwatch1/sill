import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { TAB_COLORS, type TabColor } from '../../../shared/notes'
import styles from './ContextMenu.module.css'

type MenuItem =
  | {
      type: 'item'
      label: string
      onSelect: () => void
      shortcut?: string
      destructive?: boolean
      disabled?: boolean
      /** Seçim listesi (ör. mikrofonlar): true → solda onay işareti. Tanımlıysa sol boşluk ayrılır. */
      checked?: boolean
    }
  | { type: 'separator' }
  | { type: 'colors'; value: TabColor | null; onSelect: (color: TabColor | null) => void }

const COLOR_NAMES: Record<TabColor, string> = {
  blue: 'Mavi',
  pink: 'Pembe',
  green: 'Yeşil',
  yellow: 'Sarı',
  purple: 'Mor',
  orange: 'Turuncu'
}

type OpenMenu = (e: ReactMouseEvent, items: MenuItem[]) => void
const MenuContext = createContext<OpenMenu>(() => {})

/** Sağ tık menüsünü açmak için: `const openMenu = useContextMenu(); onContextMenu={(e) => openMenu(e, [...])}` */
export const useContextMenu = () => useContext(MenuContext)

interface HostProps {
  /** Menü bu kutunun (panel) içinde konumlanır ve dışına taşmaz. */
  container: RefObject<HTMLElement | null>
  children: ReactNode
}

interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

export function ContextMenuHost({ container, children }: HostProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  const open = useCallback<OpenMenu>(
    (e, items) => {
      e.preventDefault()
      e.stopPropagation()
      const box = container.current?.getBoundingClientRect()
      if (!box) return
      setMenu({ x: e.clientX - box.left, y: e.clientY - box.top, items })
    },
    [container]
  )

  return (
    <MenuContext.Provider value={open}>
      {children}
      <AnimatePresence>
        {menu && <Menu key={`${menu.x},${menu.y}`} {...menu} container={container} onClose={() => setMenu(null)} />}
      </AnimatePresence>
    </MenuContext.Provider>
  )
}

function Menu({
  x,
  y,
  items,
  container,
  onClose
}: MenuState & { container: RefObject<HTMLElement | null>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Panelin kenarından taşmasın: sağa sığmıyorsa sola, alta sığmıyorsa yukarı aç.
  useLayoutEffect(() => {
    const menuBox = ref.current?.getBoundingClientRect()
    const box = container.current?.getBoundingClientRect()
    if (!menuBox || !box) return
    const margin = 8
    const left = x + menuBox.width > box.width - margin ? Math.max(margin, x - menuBox.width) : x
    const top = y + menuBox.height > box.height - margin ? Math.max(margin, y - menuBox.height) : y
    setPos({ left, top })
  }, [x, y, container])

  // Dışarı tıklama, Esc, kaydırma veya pencere odağını kaybetme → kapan.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // Esc sadece menüyü kapatsın, paneli değil
        onClose()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('wheel', onClose, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('wheel', onClose, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const run = (fn: () => void) => {
    onClose()
    fn()
  }

  return (
    <motion.div
      ref={ref}
      className={styles.menu}
      style={pos}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.1 } }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      // Menüye basmak yazı alanının odağını/seçimini çalmasın (Kes/Kopyala için gerekli).
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') return <div key={i} className={styles.separator} />
        if (item.type === 'colors') {
          return (
            <div key={i} className={styles.colorSection}>
              <div className={styles.sectionLabel}>Renk</div>
              <div className={styles.colors}>
                <button
                  className={`${styles.swatch} ${styles.none} ${item.value == null ? styles.selected : ''}`}
                  title="Renksiz"
                  onClick={() => run(() => item.onSelect(null))}
                />
                {TAB_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`${styles.swatch} ${item.value === c ? styles.selected : ''}`}
                    style={{ background: `var(--c-${c})` }}
                    title={COLOR_NAMES[c]}
                    onClick={() => run(() => item.onSelect(c))}
                  >
                    {item.value === c && <Check size={10} strokeWidth={3.5} />}
                  </button>
                ))}
              </div>
            </div>
          )
        }
        return (
          <button
            key={i}
            className={`${styles.item} ${item.destructive ? styles.destructive : ''}`}
            disabled={item.disabled}
            onClick={() => run(item.onSelect)}
          >
            {item.checked !== undefined && (
              <span className={styles.check}>{item.checked && <Check size={12} strokeWidth={3} />}</span>
            )}
            <span className={styles.label}>{item.label}</span>
            {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
          </button>
        )
      })}
    </motion.div>
  )
}
