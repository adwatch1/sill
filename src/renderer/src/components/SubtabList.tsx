import { useEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, Reorder, motion } from 'framer-motion'
import { Coffee, Plus, X } from 'lucide-react'
import { useNotes } from '../store/notesStore'
import type { Subtab, Tab } from '../../../shared/notes'
import { itemEnter, itemExit, itemVisible, springSnappy } from '../motion'
import { useHoldToDrag } from '../hooks/useHoldToDrag'
import { EditableLabel } from './EditableLabel'
import type { ConfirmRequest } from './ConfirmDialog'
import { useContextMenu } from './ContextMenu'
import styles from './SubtabList.module.css'
import { useI18n } from '../i18n'

interface Props {
  tab: Tab
  onConfirm: (req: ConfirmRequest) => void
}

// Seçili tab'ın alt başlıkları (solda, dikey). Davranış üst tab'larla aynı:
// tıkla = seç · çift tıkla = yeniden adlandır · basılı tut + sürükle = sırala · × = sil.
export function SubtabList({ tab, onConfirm }: Props) {
  const { actions } = useNotes()
  const { t } = useI18n()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const focusId = renamingId ?? tab.activeSubtabId
  useEffect(() => {
    if (!focusId) return
    listRef.current
      ?.querySelector(`[data-id="${focusId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusId, tab.subtabs.length])

  const add = () => setRenamingId(actions.addSubtab(tab.id, t('subtabs.new')))

  const remove = (sub: Subtab) => {
    const doDelete = () => actions.deleteSubtab(tab.id, sub.id)
    if (!sub.content.trim()) return doDelete()
    onConfirm({
      title: t('tabs.confirmTitle', { name: sub.title }),
      message: t('subtabs.confirmMessage'),
      onConfirm: doDelete
    })
  }

  return (
    <nav className={styles.column}>
      <Reorder.Group
        as="div"
        axis="y"
        ref={listRef}
        values={tab.subtabs}
        onReorder={(subs: Subtab[]) => actions.reorderSubtabs(tab.id, subs.map((s) => s.id))}
        className={styles.list}
        layoutScroll
        layoutRoot /* liste konumlarını kendi kökünden ölçsün (panel boyutlanırken sapmasın) */
      >
        <AnimatePresence initial={false} mode="popLayout">
          {tab.subtabs.map((sub) => (
            <SubtabItem
              key={sub.id}
              sub={sub}
              tabId={tab.id}
              active={sub.id === tab.activeSubtabId}
              renaming={renamingId === sub.id}
              onSelect={() => actions.selectSubtab(tab.id, sub.id)}
              onStartRename={() => setRenamingId(sub.id)}
              onRename={(title) => actions.renameSubtab(tab.id, sub.id, title)}
              onRenameDone={() => setRenamingId(null)}
              onRemove={() => remove(sub)}
              bounds={listRef}
            />
          ))}
        </AnimatePresence>

        {/* Listenin İÇİNDE (son öğe) ve liste sütunun altına kadar uzanıyor: sürüklenen başlık
            aşağıda hareket edecek boş alan bulsun, kutunun kenarında kesilmesin. */}
        <motion.button layout="position" className={styles.add} onClick={add}>
          <Plus size={13} strokeWidth={2} />
          <span>{t('subtabs.new')}</span>
        </motion.button>
      </Reorder.Group>

      {/* Destek: sütunun altında, notun "Düzenlendi" satırıyla aynı hizada. Bilerek sade (gri, küçük);
          sürekli göründüğü için reklam gibi durmamalı. */}
      <footer className={styles.support}>
        <button className={styles.supportButton} title={t('settings.coffee')} onClick={() => window.settings.openSupport()}>
          <Coffee size={12} strokeWidth={2} />
          <span>{t('support.short')}</span>
        </button>
      </footer>
    </nav>
  )
}

interface SubtabItemProps {
  sub: Subtab
  tabId: string
  active: boolean
  renaming: boolean
  onSelect: () => void
  onStartRename: () => void
  onRename: (title: string) => void
  onRenameDone: () => void
  onRemove: () => void
  bounds: RefObject<HTMLDivElement | null>
}

function SubtabItem(props: SubtabItemProps) {
  const { sub, tabId, active, renaming } = props
  const { lifted, itemProps } = useHoldToDrag(renaming, props.bounds)
  const openMenu = useContextMenu()
  const { t } = useI18n()

  return (
    <Reorder.Item
      as="div"
      value={sub}
      data-id={sub.id}
      {...itemProps}
      layout="position"
      className={`${styles.item} ${active ? styles.active : ''} ${lifted ? styles.lifted : ''}`}
      initial={itemEnter}
      animate={lifted ? { opacity: 1, scale: 1.05 } : itemVisible}
      exit={itemExit}
      transition={springSnappy}
      style={{ zIndex: lifted ? 5 : 0 }}
      onClick={props.onSelect}
      onDoubleClick={props.onStartRename}
      onContextMenu={(e) =>
        openMenu(e, [
          { type: 'item', label: t('tabs.rename'), onSelect: props.onStartRename },
          { type: 'separator' },
          { type: 'item', label: t('subtabs.delete'), destructive: true, onSelect: props.onRemove }
        ])
      }
    >
      {active && (
        // layoutId tab'a özel: tab değişince hap tab'lar arasında uçmasın.
        <motion.div layoutId={`subtabPill-${tabId}`} className={styles.pill} transition={springSnappy} />
      )}
      <EditableLabel
        className={styles.label}
        value={sub.title}
        editing={renaming}
        onCommit={props.onRename}
        onDone={props.onRenameDone}
      />
      <button
        className={styles.close}
        title={t('subtabs.delete')}
        onPointerDown={(e) => e.stopPropagation()} // × basmak sürüklemeyi başlatmasın
        onClick={(e) => {
          e.stopPropagation()
          props.onRemove()
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <X size={10} strokeWidth={2.5} />
      </button>
    </Reorder.Item>
  )
}
