import { useEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, Reorder, motion } from 'framer-motion'
import { Pin, Plus, Settings, X } from 'lucide-react'
import { useNotes } from '../store/notesStore'
import { isTabColor, type Tab, type TabColor } from '../../../shared/notes'
import { itemEnter, itemExit, itemVisible, springSnappy } from '../motion'
import { useHoldToDrag } from '../hooks/useHoldToDrag'
import { EditableLabel } from './EditableLabel'
import type { ConfirmRequest } from './ConfirmDialog'
import { useContextMenu } from './ContextMenu'
import styles from './TabBar.module.css'
import { useI18n } from '../i18n'

interface Props {
  /** Panel/sütun kenarından sürükleme sürüyor mu (aşağıdaki uzun nota bak). */
  resizing: boolean
  onConfirm: (req: ConfirmRequest) => void
  onOpenSettings: () => void
  pinned: boolean
  onTogglePin: () => void
}

// Üstteki ana konular. Tıkla = seç · çift tıkla = yeniden adlandır · basılı tut + sürükle = sırala
// · üzerine gel → köşedeki rozet = sil.
export function TabBar({ resizing, onConfirm, onOpenSettings, pinned, onTogglePin }: Props) {
  const { data, actions } = useNotes()
  const { t } = useI18n()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)

  // ⚠️ Panel kenarından genişletilirken framer-motion, tab'ların konumunu YANLIŞ
  // düzeltiyor: her ölçümde konumlarıyla orantılı bir kayma ekliyor, bunlar birikip
  // tab'ları üst üste getiriyordu (ölçüldü: 3. tab'da 218 px).
  // Kaynağı framer-motion'ın iç projeksiyon hesabı — layoutRoot, layoutDependency,
  // useResetProjection ve iki katmanlı ray denendi, hiçbiri çözmedi.
  // Çözüm: boyutlandırma sürerken bu düzeltmeler CSS ile görünmez kılınıyor
  // (`styles.frozen`), sürükleme bitince ray yeniden kuruluyor (key) ve birikmiş
  // ne varsa sıfırlanıyor. Genişlik değişiminde tab konumları zaten değişmediği için
  // dondurulan hiçbir gerçek animasyon yok.
  const [railKey, setRailKey] = useState(0)
  const wasResizing = useRef(false)
  useEffect(() => {
    if (wasResizing.current && !resizing) setRailKey((k) => k + 1)
    wasResizing.current = resizing
  }, [resizing])

  // Kaydırılabilen tarafta kenar yumuşakça solsun (tab'lar sığmadığında).
  const [fade, setFade] = useState({ left: false, right: false })
  const updateFade = () => {
    const el = trackRef.current
    if (!el) return
    // scrollWidth yerine son tab'ın gerçek konumuna bak: hareket halindeki seçim hapı sayılmasın.
    const tabs = el.querySelectorAll<HTMLElement>('[data-id]')
    const last = tabs[tabs.length - 1]
    const left = el.scrollLeft > 1
    const right = last ? last.getBoundingClientRect().right - el.getBoundingClientRect().right > 1 : false
    setFade((f) => (f.left === left && f.right === right ? f : { left, right }))
  }
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    // Ray veya herhangi bir tab'ın boyutu değişince (font yüklenmesi, yeniden adlandırma,
    // ekleme/silme animasyonu) yeniden ölç.
    const observer = new ResizeObserver(updateFade)
    observer.observe(el)
    if (railRef.current) {
      observer.observe(railRef.current)
      Array.from(railRef.current.children).forEach((child) => observer.observe(child))
    }
    updateFade()
    const t = setTimeout(updateFade, 400) // silinen tab'ın çıkış animasyonu bitince bir daha
    return () => {
      observer.disconnect()
      clearTimeout(t)
    }
  }, [data.tabs, railKey])

  // Yeni eklenen / seçilen tab görünmüyorsa kaydırıp göster.
  const focusId = renamingId ?? data.activeTabId
  useEffect(() => {
    if (!focusId) return
    trackRef.current
      ?.querySelector(`[data-id="${focusId}"]`)
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [focusId, data.tabs.length])

  const add = () => setRenamingId(actions.addTab(t('tabs.new')))

  const remove = (tab: Tab) => {
    const doDelete = () => actions.deleteTab(tab.id)
    if (tab.subtabs.length === 0) return doDelete()
    onConfirm({
      title: t('tabs.confirmTitle', { name: tab.title }),
      message: t('tabs.confirmMessage', { count: tab.subtabs.length }),
      onConfirm: doDelete
    })
  }

  return (
    <header className={styles.bar}>
      {/* ⚠️ İKİ KATMAN, bilerek: dıştaki kutu panelle birlikte büyür; tab'ların içinde
          durduğu ray ise içerik kadar geniştir (`width: max-content`), yani panel
          genişletilirken kutusu DEĞİŞMEZ. Tek katman olduğunda framer-motion rayın
          genişlemesini ölçek değişimi sanıp tab'lara konumlarıyla orantılı hatalı bir
          kayma ekliyordu; sürükledikçe birikip tab'ları üst üste getiriyordu
          (ölçüldü: 3. tab'da 218 px). */}
      <div
        ref={trackRef}
        className={`${styles.track} ${fade.left ? styles.fadeLeft : ''} ${fade.right ? styles.fadeRight : ''}`}
        onScroll={updateFade}
        onWheel={(e) => (e.currentTarget.scrollLeft += e.deltaY)}
      >
        <Reorder.Group
          key={railKey}
          as="div"
          axis="x"
          ref={railRef}
          values={data.tabs}
          onReorder={(tabs: Tab[]) => actions.reorderTabs(tabs.map((t) => t.id))}
          className={`${styles.rail} ${resizing ? styles.frozen : ''}`}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {data.tabs.map((tab) => (
              <TabItem
                key={tab.id}
                tab={tab}
                active={tab.id === data.activeTabId}
                renaming={renamingId === tab.id}
                onSelect={() => actions.selectTab(tab.id)}
                onStartRename={() => setRenamingId(tab.id)}
                onRename={(title) => actions.renameTab(tab.id, title)}
                onRenameDone={() => setRenamingId(null)}
                onRemove={() => remove(tab)}
                onColor={(color) => actions.setTabColor(tab.id, color)}
                bounds={trackRef}
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>
      </div>

      <button className={styles.add} title={t('tabs.new')} onClick={add}>
        <Plus size={16} strokeWidth={1.8} />
      </button>
      <button
        className={`${styles.add} ${styles.pin} ${pinned ? styles.pinned : ''}`}
        title={pinned ? t('tabs.pinned') : t('tabs.pin')}
        aria-pressed={pinned}
        onClick={onTogglePin}
      >
        <Pin size={15} strokeWidth={1.9} fill={pinned ? 'currentColor' : 'none'} />
      </button>
      <button className={styles.add} title={t('tabs.settings')} onClick={onOpenSettings}>
        <Settings size={15} strokeWidth={1.8} />
      </button>
    </header>
  )
}

interface TabItemProps {
  tab: Tab
  active: boolean
  renaming: boolean
  onSelect: () => void
  onStartRename: () => void
  onRename: (title: string) => void
  onRenameDone: () => void
  onRemove: () => void
  onColor: (color: TabColor | null) => void
  bounds: RefObject<HTMLDivElement | null>
}

function TabItem(props: TabItemProps) {
  const { tab, active, renaming } = props
  const { lifted, itemProps } = useHoldToDrag(renaming, props.bounds)
  const openMenu = useContextMenu()
  const { t } = useI18n()
  const color = isTabColor(tab.color) ? tab.color : null

  return (
    <Reorder.Item
      as="div"
      value={tab}
      data-id={tab.id}
      {...itemProps}
      layout="position"
      className={`${styles.tab} ${active ? styles.active : ''} ${lifted ? styles.lifted : ''}`}
      initial={itemEnter}
      animate={lifted ? { opacity: 1, scale: 1.1 } : itemVisible}
      exit={itemExit}
      transition={springSnappy}
      style={{ zIndex: lifted ? 5 : 0 }}
      onClick={props.onSelect}
      onDoubleClick={props.onStartRename}
      onContextMenu={(e) =>
        openMenu(e, [
          { type: 'item', label: t('tabs.rename'), onSelect: props.onStartRename },
          { type: 'separator' },
          { type: 'colors', value: color, onSelect: props.onColor },
          { type: 'separator' },
          { type: 'item', label: t('tabs.delete'), destructive: true, onSelect: props.onRemove }
        ])
      }
    >
      {active && <motion.div layoutId="tabPill" className={styles.pill} transition={springSnappy} />}
      {color && <span className={styles.dot} style={{ background: `var(--c-${color})` }} />}
      <EditableLabel
        className={styles.label}
        value={tab.title}
        editing={renaming}
        onCommit={props.onRename}
        onDone={props.onRenameDone}
      />
      <button
        className={styles.close}
        title={t('tabs.delete')}
        onPointerDown={(e) => e.stopPropagation()} // rozete basmak sürüklemeyi başlatmasın
        onClick={(e) => {
          e.stopPropagation()
          props.onRemove()
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <X size={10} strokeWidth={3} />
      </button>
    </Reorder.Item>
  )
}
