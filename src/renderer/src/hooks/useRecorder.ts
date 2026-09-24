import { useCallback, useEffect, useRef, useState } from 'react'

// Mikrofonla ses kaydı.
//
// Mikrofon kayda DOĞRUDAN bağlanmıyor, arada küçük bir ses mikseri (Web Audio) var:
//   mikrofon → [giriş] → dalga ölçer
//                      → karışım çıkışı → MediaRecorder (webm/opus)
// Böylece kayıt sürerken mikrofon değiştirilebiliyor: sadece mikserin girişi değişiyor,
// kaydedici hiç durmuyor, dosya tek parça kalıyor.
//
// ⚠️ Mikrofonun kapanması pazarlığa kapalı. Kayıt bitince, iptal edilince, panel gizlenince,
// parça kalkınca ve her hatada `releaseMic` çağrılır: Windows'un görev çubuğundaki
// "mikrofon kullanılıyor" simgesi sönmeli.

const MIME = 'audio/webm;codecs=opus'
/** 64 kbps Opus: konuşma için bol, dakikası ~0,5 MB. */
const BITRATE = 64_000
/** Bundan kısa kayıt yanlışlıkla basılmıştır, nota girmez. */
const MIN_MS = 700
/** Unutulan bir kayıt sonsuza kadar sürmesin: 2 saatte kendiliğinden durur ve kaydedilir. */
const MAX_RECORD_MS = 2 * 60 * 60 * 1000

type RecorderState = 'idle' | 'starting' | 'recording'

export interface MicDevice {
  id: string
  label: string
}

/** Kayıt başladığında "bittiğinde nereye konacak" bilgisi. Kayıt bitene kadar değişmez. */
export interface RecordTarget {
  tabId: string
  subId: string
  /** Sağ tıkla başlatıldıysa imlecin yeri; alttaki düğmeyle başlatıldıysa yok (notun sonuna). */
  caret?: { blockId: string; from: number; to: number }
}

interface RecordError {
  message: string
  /** true → Windows mikrofon ayarlarını açan düğme gösterilsin. */
  openSettings?: boolean
}

interface Session {
  target: RecordTarget
  ctx: AudioContext
  analyser: AnalyserNode
  dest: MediaStreamAudioDestinationNode
  source: MediaStreamAudioSourceNode
  stream: MediaStream
  recorder: MediaRecorder
  chunks: Blob[]
  startedAt: number
  discard: boolean
  released: boolean
}

interface Options {
  /** Kayıt bitti: dosya baytları ve süre. */
  onDone: (target: RecordTarget, bytes: Uint8Array, durationMs: number) => void
  onError: (err: RecordError) => void
}

/** getUserMedia hatasını Türkçe ve çözüm söyleyen bir mesaja çevir. */
function describe(e: unknown): RecordError {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      message: 'Mikrofona erişilemiyor. Windows ayarlarında masaüstü uygulamalarının mikrofonu kullanmasına izin verin.',
      openSettings: true
    }
  }
  if (name === 'NotFoundError') return { message: 'Bağlı bir mikrofon bulunamadı.' }
  if (name === 'NotReadableError') {
    return { message: 'Mikrofon açılamadı. Başka bir program kullanıyor olabilir.' }
  }
  return { message: 'Mikrofon açılamadı.' }
}

/**
 * Mikrofonu aç. Kayıtlı mikrofon artık takılı değilse `ideal` sayesinde Windows'un
 * varsayılanına düşer; hata vermez.
 */
function openMic(id: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: id ? { deviceId: { ideal: id } } : true,
    video: false
  })
}

/** Bağlı mikrofonlar. Windows'un sanal "Varsayılan" / "İletişim" girişleri listede tekrar etmesin. */
async function listMics(): Promise<MicDevice[]> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Mikrofon ${i + 1}` }))
}

const stopTracks = (s: MediaStream): void => s.getTracks().forEach((t) => t.stop())

export function useRecorder({ onDone, onError }: Options) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [devices, setDevices] = useState<MicDevice[]>([])
  /**
   * Kullanıcının seçtiği mikrofon ('' = Windows varsayılanı). Menüdeki onay işareti bunu gösterir.
   * Windows varsayılan girişi ayrı bir takma adla bildirdiği için "şu an açık olan cihaz"ı
   * listeyle güvenilir eşleştiremiyoruz; seçimi göstermek hem basit hem dürüst.
   */
  const [chosenId, setChosenId] = useState('')
  const session = useRef<Session | null>(null)
  const mounted = useRef(true)
  // Geri çağrılar ref'te: kayıt sürerken yeniden çizimler eski kapanışları tutmasın.
  const cb = useRef({ onDone, onError })
  cb.current = { onDone, onError }

  /** Mikrofonu ve mikseri kapat. İki kez çağrılması zararsız. */
  const releaseMic = useCallback((s: Session): void => {
    if (s.released) return
    s.released = true
    stopTracks(s.stream)
    void s.ctx.close().catch(() => {})
    window.panel.recording(false)
  }, [])

  const finish = useCallback(
    async (s: Session): Promise<void> => {
      releaseMic(s)
      if (session.current === s) session.current = null
      if (mounted.current) {
        setState('idle')
        setElapsed(0)
      }
      if (s.discard) return
      const durationMs = Math.round(performance.now() - s.startedAt)
      if (durationMs < MIN_MS || s.chunks.length === 0) {
        cb.current.onError({ message: 'Kayıt çok kısaydı, eklenmedi.' })
        return
      }
      const blob = new Blob(s.chunks, { type: MIME })
      cb.current.onDone(s.target, new Uint8Array(await blob.arrayBuffer()), durationMs)
    },
    [releaseMic]
  )

  /** Kaydı bitir ve nota koy. */
  const stop = useCallback((): void => {
    const s = session.current
    if (!s) return
    // Mikrofon HEMEN söner; kaydedici elindeki son parçayı verip `onstop`u tetikler.
    stopTracks(s.stream)
    if (s.recorder.state !== 'inactive') s.recorder.stop()
    else void finish(s)
  }, [finish])

  /** Kaydı at: hiçbir şey kaydedilmez. */
  const cancel = useCallback((): void => {
    const s = session.current
    if (!s) return
    s.discard = true
    stop()
  }, [stop])

  /** Mikrofon takılı değilken çıkarıldıysa varsayılana geç; o da olmazsa kaydı bitir. */
  const watchTrack = useCallback(
    (s: Session, stream: MediaStream): void => {
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (session.current !== s || s.stream !== stream) return
        void switchInput(s, '').catch(() => stop())
      })
    },
    // switchInput aşağıda `function` olarak tanımlı (önceden erişilebilir); sadece ref ve
    // değişmeyen setter'lar kullandığı için ilk çizimdeki hâli yeterli.
    [stop]
  )

  /** Mikserin girişini yeni mikrofona bağla; kayıt kesilmez. */
  async function switchInput(s: Session, id: string): Promise<void> {
    const stream = await openMic(id)
    if (session.current !== s || s.released) {
      stopTracks(stream) // bu arada kayıt bittiyse yeni mikrofonu açık bırakma
      return
    }
    const source = s.ctx.createMediaStreamSource(stream)
    source.connect(s.analyser)
    source.connect(s.dest)
    s.source.disconnect()
    stopTracks(s.stream)
    s.source = source
    s.stream = stream
    watchTrack(s, stream)
  }

  const start = useCallback(
    async (target: RecordTarget): Promise<void> => {
      if (session.current || state !== 'idle') return
      setState('starting')
      let stream: MediaStream
      try {
        const { settings } = await window.settings.get()
        setChosenId(settings.micId)
        stream = await openMic(settings.micId)
      } catch (e) {
        if (mounted.current) setState('idle')
        cb.current.onError(describe(e))
        return
      }
      // Mikrofon açılırken panel kapandıysa hiç başlamadan söndür.
      if (!mounted.current) {
        stopTracks(stream)
        return
      }

      let s: Session
      try {
        const ctx = new AudioContext()
        void ctx.resume()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        const dest = ctx.createMediaStreamDestination()
        source.connect(analyser)
        source.connect(dest)
        const recorder = new MediaRecorder(dest.stream, { mimeType: MIME, audioBitsPerSecond: BITRATE })
        s = {
          target,
          ctx,
          analyser,
          dest,
          source,
          stream,
          recorder,
          chunks: [],
          startedAt: performance.now(),
          discard: false,
          released: false
        }
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) s.chunks.push(e.data)
        }
        recorder.onstop = () => void finish(s)
        recorder.onerror = () => {
          s.discard = true
          void finish(s)
          cb.current.onError({ message: 'Kayıt bir hata yüzünden durdu.' })
        }
        // Parçalar saniyede bir gelsin: uzun kayıtta tek dev parça beklemeyelim.
        recorder.start(1000)
      } catch (e) {
        stopTracks(stream)
        setState('idle')
        console.error('Kayıt başlatılamadı:', e)
        cb.current.onError({ message: 'Kayıt başlatılamadı.' })
        return
      }

      session.current = s
      window.panel.recording(true)
      watchTrack(s, stream)
      setElapsed(0)
      setState('recording')
      // İzin alındıktan sonra mikrofonların adları okunabiliyor.
      listMics().then(setDevices).catch(() => {})
    },
    [state, finish, watchTrack]
  )

  /** Menüden mikrofon seçildi: hatırla ve kayıt sürüyorsa hemen geç. */
  const selectMic = useCallback(
    async (id: string): Promise<void> => {
      void window.settings.set({ micId: id })
      setChosenId(id)
      const s = session.current
      if (!s) return
      try {
        await switchInput(s, id)
      } catch (e) {
        cb.current.onError(describe(e))
      }
    },
    []
  )

  // Kayıt sürerken: süre sayacı ve 2 saat sınırı.
  useEffect(() => {
    if (state !== 'recording') return
    const t = window.setInterval(() => {
      const s = session.current
      if (!s) return
      const ms = performance.now() - s.startedAt
      setElapsed(ms)
      if (ms >= MAX_RECORD_MS) stop()
    }, 200)
    return () => window.clearInterval(t)
  }, [state, stop])

  // Kayıt sürerken mikrofon takılıp çıkarılırsa listeyi tazele.
  useEffect(() => {
    if (state !== 'recording') return
    const refresh = (): void => void listMics().then(setDevices).catch(() => {})
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
  }, [state])

  // Panel gizlenmeye başladığı AN kayıt biter ve mikrofon söner (kapanış animasyonunu
  // beklemeden). Kayıt kaybolmaz, nota konur.
  useEffect(() => window.panel.onHide(() => stop()), [stop])

  // Parça kalkarken (panel kapandı, alt başlık değişti): kaydı bitir, mikrofonu kapat.
  // Nota koyma işi store'da yaşadığı için parça kalksa da tamamlanır.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const s = session.current
      if (!s) return
      stopTracks(s.stream)
      if (s.recorder.state !== 'inactive') s.recorder.stop()
      else void finish(s)
    }
  }, [finish])

  return {
    state,
    elapsed,
    devices,
    chosenId,
    /** Canlı dalga şeridi bu ölçerden okur (kayıt yokken null). */
    analyser: session.current?.analyser ?? null,
    start,
    stop,
    cancel,
    selectMic
  }
}
