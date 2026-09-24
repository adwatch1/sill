import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LayoutGroup, motion } from 'framer-motion'
import { ChevronLeft, Coffee, ExternalLink, FolderOpen } from 'lucide-react'
import { formatShortcut, LIMITS, type Settings, type ThemeMode } from '../../../shared/settings'
import { springSnappy } from '../motion'
// Sadece sürüm numarası: package.json'ın tamamı programın içine gömülmesin.
import { version } from '../../../../package.json'
import { COPYRIGHT } from '../../../shared/app'
import styles from './SettingsView.module.css'

interface Props {
  onClose: () => void
}

// Panelin üzerine sağdan kayarak gelen Ayarlar ekranı (iPhone ayarları gibi).
// Her değişiklik anında uygulanır ve kaydedilir; "Kaydet" düğmesi yok.
export function SettingsView({ onClose }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [isPackaged, setIsPackaged] = useState(false)
  const [isStore, setIsStore] = useState(false)
  const [layoutGroupId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    window.settings.get().then((r) => {
      setSettings(r.settings)
      setIsPackaged(r.isPackaged)
      setIsStore(r.isStore)
    })
  }, [])

  /** Ayarı değiştir; arka plan geçerli (gerekirse düzeltilmiş) ayarları döndürür. Hata varsa mesajı döner. */
  const update = async (patch: Partial<Settings>): Promise<string | null> => {
    if (settings) setSettings({ ...settings, ...patch }) // kaydırıcı anında tepki versin
    const r = await window.settings.set(patch)
    setSettings(r.settings)
    return r.ok ? null : r.error
  }

  return (
    <motion.div
      className={styles.view}
      initial={{ x: '100%' }}
      animate={{ x: 0, transition: { type: 'spring', stiffness: 520, damping: 44, mass: 0.8 } }}
      exit={{ x: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
    >
      <header className={styles.header}>
        <button className={styles.back} onClick={onClose}>
          <ChevronLeft size={18} strokeWidth={2.2} />
          <span>Notlar</span>
        </button>
        <h1 className={styles.title}>Ayarlar</h1>
      </header>

      {settings && (
        <LayoutGroup id={layoutGroupId}>
          <div className={styles.scroll}>
            <Group title="Görünüm">
              <Row label="Tema">
                <Segmented
                  value={settings.theme}
                  options={[
                    ['system', 'Sistem'],
                    ['light', 'Açık'],
                    ['dark', 'Koyu']
                  ]}
                  onChange={(theme) => update({ theme })}
                />
              </Row>
            </Group>

            <Group title="Açılma">
              <SliderRow
                label="Tetik bölgesi"
                hint="Ekranın sağ kenarında, panelin açıldığı alan"
                value={settings.triggerZone}
                display={`%${Math.round(settings.triggerZone * 100)}`}
                {...LIMITS.triggerZone}
                onChange={(triggerZone) => update({ triggerZone })}
                extra={<ZonePreview zone={settings.triggerZone} />}
              />
              <SliderRow
                label="Açılma gecikmesi"
                hint="Mouse kenarda bu kadar durunca açılır"
                value={settings.dwellMs}
                display={settings.dwellMs === 0 ? 'Anında' : `${settings.dwellMs} ms`}
                {...LIMITS.dwellMs}
                onChange={(dwellMs) => update({ dwellMs })}
              />
              <Row label="Klavye kısayolu">
                <ShortcutRecorder value={settings.shortcut} onChange={(shortcut) => update({ shortcut })} />
              </Row>
            </Group>

            <Group
              title="Sistem"
              footnote={
                isStore
                  ? 'Sill, Windows açılışında kendiliğinden başlar. Açıp kapatmak için Windows Ayarları → Başlangıç.'
                  : isPackaged
                    ? undefined
                    : 'Windows açılışında başlatma, programı kurduktan sonra çalışır.'
              }
            >
              <Row label="Windows açılışında başlat">
                {isStore ? (
                  // Mağaza sürümünde bu ayar Windows'un kendi Başlangıç sayfasında.
                  <button className={styles.button} onClick={() => window.settings.openStartupSettings()}>
                    <ExternalLink size={13} strokeWidth={2} />
                    Ayarla
                  </button>
                ) : (
                  <Toggle
                    checked={settings.launchAtStartup}
                    disabled={!isPackaged}
                    onChange={(launchAtStartup) => update({ launchAtStartup })}
                  />
                )}
              </Row>
              <Row label="Notların klasörü">
                <button className={styles.button} onClick={() => window.settings.openDataFolder()}>
                  <FolderOpen size={13} strokeWidth={2} />
                  Klasörü aç
                </button>
              </Row>
            </Group>

            <Group
              title="Gizlilik"
              footnote="Açıkken nota bir YouTube linki yapıştırınca videonun küçük resmi ve başlığı YouTube'dan bir kez indirilir. Sill'in internete çıktığı tek yer burası. Kapalıyken kart resimsiz görünür."
            >
              <Row label="Link önizlemeleri">
                <Toggle checked={settings.linkPreviews} onChange={(linkPreviews) => update({ linkPreviews })} />
              </Row>
            </Group>

            <Group title="Destek" footnote="Sill ücretsiz. Beğendiysen bir kahve ısmarlayarak geliştirilmesine destek olabilirsin.">
              <Row label="Sill'i beğendin mi?">
                <button className={styles.button} onClick={() => window.settings.openSupport()}>
                  <Coffee size={13} strokeWidth={2} />
                  Kahve ısmarla
                </button>
              </Row>
            </Group>

            <p className={styles.version}>
              Sill {version} · {COPYRIGHT}
            </p>
          </div>
        </LayoutGroup>
      )}
    </motion.div>
  )
}

// ── Yapı taşları ─────────────────────────────────────────────

function Group({ title, footnote, children }: { title: string; footnote?: string; children: ReactNode }) {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <div className={styles.groupBox}>{children}</div>
      {footnote && <p className={styles.footnote}>{footnote}</p>}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  )
}

interface SliderRowProps {
  label: string
  hint?: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  extra?: ReactNode
}

function SliderRow({ label, hint, value, display, min, max, step, onChange, extra }: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className={`${styles.row} ${styles.sliderRow}`}>
      <div className={styles.sliderHead}>
        <div>
          <span className={styles.label}>{label}</span>
          {hint && <div className={styles.hint}>{hint}</div>}
        </div>
        <span className={styles.value}>{display}</span>
      </div>
      <div className={styles.sliderLine}>
        <input
          type="range"
          className={styles.slider}
          style={{ ['--pct' as string]: `${pct}%` }}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {extra}
      </div>
    </div>
  )
}

function Segmented({
  value,
  options,
  onChange
}: {
  value: ThemeMode
  options: [ThemeMode, string][]
  onChange: (v: ThemeMode) => void
}) {
  return (
    <div className={styles.segmented}>
      {options.map(([v, label]) => (
        <button key={v} className={`${styles.segment} ${v === value ? styles.segmentActive : ''}`} onClick={() => onChange(v)}>
          {v === value && <motion.div layoutId="themePill" className={styles.segmentPill} transition={springSnappy} />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

function Toggle({
  checked,
  disabled,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
      onClick={() => onChange(!checked)}
    >
      <motion.span className={styles.knob} layout transition={springSnappy} />
    </button>
  )
}

/** Tetik bölgesinin minik ekran çizimi: sağ kenardaki kırmızı çizgi bölge kadar uzar. */
function ZonePreview({ zone }: { zone: number }) {
  const h = 34
  const barH = h * zone
  return (
    <svg className={styles.zone} width="54" height={h + 2} viewBox={`0 0 54 ${h + 2}`} aria-hidden>
      <rect x="1" y="1" width="52" height={h} rx="3" className={styles.zoneScreen} />
      <rect x="49" y={1 + (h - barH) / 2} width="3" height={barH} rx="1.5" className={styles.zoneBar} />
    </svg>
  )
}

// ── Kısayol kaydedici ───────────────────────────────────────

// Klavyedeki fiziksel tuş → Electron kısayol adı (Türkçe klavyede de doğru çalışsın diye e.code).
function keyFromCode(code: string): string | null {
  let m: RegExpMatchArray | null
  if ((m = code.match(/^Key([A-Z])$/))) return m[1]
  if ((m = code.match(/^Digit(\d)$/))) return m[1]
  if ((m = code.match(/^F(\d{1,2})$/))) return `F${m[1]}`
  if ((m = code.match(/^Numpad(\d)$/))) return `num${m[1]}`
  const map: Record<string, string> = {
    Space: 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Enter',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Delete: 'Delete'
  }
  return map[code] ?? null // Ctrl/Alt/Shift gibi tek başına değiştirici tuşlar → null
}

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (v: string) => Promise<string | null> }) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // En güncel onChange'i ref'te tut: ekran yeniden çizilince kayıt dinleyicisi baştan kurulmasın.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!recording) return
    window.settings.recording(true) // mevcut kısayol geçici bırakılsın (basınca panel kapanmasın)

    // "capture": tuşlar önce buraya gelsin; Esc paneli kapatmasın, sadece kaydı iptal etsin.
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(false)
      const key = keyFromCode(e.code)
      if (!key) return // şimdilik sadece Ctrl/Alt/Shift basılı, asıl tuş bekleniyor
      const mods = [
        e.ctrlKey && 'Control',
        e.altKey && 'Alt',
        e.shiftKey && 'Shift',
        e.metaKey && 'Super'
      ].filter(Boolean) as string[]
      if (mods.length === 0 || (mods.length === 1 && mods[0] === 'Shift')) {
        setError('En az bir Ctrl, Alt veya Win tuşu gerekli.')
        return
      }
      setRecording(false)
      onChangeRef.current([...mods, key].join('+')).then(setError)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.settings.recording(false)
    }
  }, [recording])

  return (
    <div className={styles.recorderWrap}>
      <button
        className={`${styles.recorder} ${recording ? styles.recording : ''}`}
        onClick={() => {
          setError(null)
          setRecording((r) => !r)
        }}
      >
        {recording ? 'Tuşlara basın…' : formatShortcut(value)}
      </button>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
