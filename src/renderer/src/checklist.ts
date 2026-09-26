// Tik kutusu: satırın başındaki "☐ " / "☑ " karakterleri. Not düz yazı olarak kalır —
// kopyalanınca başka programda da kutu olarak görünür, veri biçimi değişmez.

export const BOX_OPEN = '☐'
export const BOX_DONE = '☑'
/** Satır başındaki kutu (arkasındaki boşluk silinmiş olabilir). */
export const BOX_RE = /^[☐☑] ?/

export function lineStart(text: string, pos: number): number {
  return text.lastIndexOf('\n', pos - 1) + 1
}

export function lineEnd(text: string, pos: number): number {
  const i = text.indexOf('\n', pos)
  return i < 0 ? text.length : i
}

/**
 * Yazı kutusunda bir aralığı Windows'un kendi yazma komutuyla değiştir.
 * Değeri doğrudan yazmak Ctrl+Z geçmişini silerdi; bu yol geri almayı korur
 * ve normal bir tuş gibi `input` olayı üretir (kayıt da oradan tetiklenir).
 */
export function replaceRange(el: HTMLTextAreaElement, from: number, to: number, text: string): void {
  el.focus()
  el.setSelectionRange(from, to)
  const ok = text === '' ? document.execCommand('delete') : document.execCommand('insertText', false, text)
  if (!ok) {
    el.setRangeText(text, from, to, 'end')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

/**
 * Araç çubuğundaki düğme: seçimin dokunduğu satırlara kutu koy, hepsinde varsa kaldır.
 * Birden fazla satırda boş satırlar atlanır.
 */
export function toggleChecklist(el: HTMLTextAreaElement): void {
  const v = el.value
  const selFrom = el.selectionStart
  const selTo = el.selectionEnd
  // Seçim bir sonraki satırın başında bitiyorsa o satır dahil değil.
  const lastPos = selTo > selFrom && v[selTo - 1] === '\n' ? selTo - 1 : selTo
  const from = lineStart(v, selFrom)
  const to = lineEnd(v, lastPos)
  const lines = v.slice(from, to).split('\n')
  const multi = lines.length > 1
  const counted = lines.filter((l) => !multi || l.trim() !== '')
  const allBoxed = counted.length > 0 && counted.every((l) => BOX_RE.test(l))
  const next = lines
    .map((l) => {
      if (multi && l.trim() === '') return l
      if (allBoxed) return l.replace(BOX_RE, '')
      return BOX_RE.test(l) ? l : `${BOX_OPEN} ${l}`
    })
    .join('\n')
  if (next === v.slice(from, to)) return
  replaceRange(el, from, to, next)
  if (multi) {
    el.setSelectionRange(from, from + next.length)
  } else {
    // Tek satırda imleç yazıyla birlikte kaysın.
    const delta = next.length - (to - from)
    el.setSelectionRange(Math.max(from, selFrom + delta), Math.max(from, selTo + delta))
  }
}

type BoxCache = { value: string; width: number; boxes: { at: number; top: number }[] }
const boxCache = new WeakMap<HTMLTextAreaElement, BoxCache>()

/**
 * Kutulu satırların yazı kutusu içindeki dikey konumu. Yazı kutusu karakter konumu vermediği için
 * aynı yazı tipi ve genişlikte görünmez bir kopya kurup satır başlarına işaret koyarak ölçüyoruz.
 * Sonuç yazı ve genişlik değişene kadar saklanır (fare her kıpırdadığında yeniden ölçülmesin).
 */
function measureBoxes(el: HTMLTextAreaElement): BoxCache['boxes'] {
  const value = el.value
  const width = el.clientWidth
  const cached = boxCache.get(el)
  if (cached && cached.value === value && cached.width === width) return cached.boxes

  const starts: number[] = []
  let i = 0
  while (i < value.length) {
    if (value[i] === BOX_OPEN || value[i] === BOX_DONE) starts.push(i)
    const nl = value.indexOf('\n', i)
    if (nl < 0) break
    i = nl + 1
  }
  let boxes: BoxCache['boxes'] = []
  if (starts.length > 0) {
    const cs = getComputedStyle(el)
    const mirror = document.createElement('div')
    mirror.style.cssText =
      'position:absolute;visibility:hidden;left:-9999px;top:0;white-space:pre-wrap;overflow-wrap:break-word;'
    mirror.style.width = `${width}px`
    mirror.style.font = cs.font
    mirror.style.letterSpacing = cs.letterSpacing
    mirror.style.padding = cs.padding
    const markers: HTMLSpanElement[] = []
    let last = 0
    for (const at of starts) {
      mirror.append(value.slice(last, at))
      const mark = document.createElement('span')
      mark.textContent = value[at]
      mirror.append(mark)
      markers.push(mark)
      last = at + 1
    }
    mirror.append(value.slice(last))
    document.body.append(mirror)
    boxes = markers.map((m, i) => ({ at: starts[i], top: m.offsetTop }))
    mirror.remove()
  }
  boxCache.set(el, { value, width, boxes })
  return boxes
}

/** Fare bir kutunun üzerindeyse o kutunun yazıdaki konumu, değilse -1. */
export function boxAtPoint(el: HTMLTextAreaElement, clientX: number, clientY: number): number {
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const fontSize = parseFloat(cs.fontSize) || 13
  // Kutu satırın ilk ~1,5 harf genişliği.
  if (clientX - r.left > fontSize * 1.5) return -1
  const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.6
  const y = clientY - r.top
  const hit = measureBoxes(el).find((b) => y >= b.top && y < b.top + lineHeight)
  return hit ? hit.at : -1
}

/** Kutunun üzerine tıklandıysa işaretini çevir. Tıklama kutuya denk geldiyse true. */
export function toggleBoxAtClick(el: HTMLTextAreaElement, clientX: number, clientY: number): boolean {
  if (el.selectionStart !== el.selectionEnd) return false // sürükleyip seçti
  const at = boxAtPoint(el, clientX, clientY)
  if (at < 0) return false
  const pos = el.selectionStart
  replaceRange(el, at, at + 1, el.value[at] === BOX_OPEN ? BOX_DONE : BOX_OPEN)
  el.setSelectionRange(pos, pos)
  return true
}

/**
 * Enter ve Backspace'in liste davranışı. Tuşu kendisi işlediyse true döner (varsayılan iptal edilmeli).
 *   • Dolu kutulu satırda Enter → yeni satır da kutuyla başlar.
 *   • Boş kutulu satırda Enter → kutu kalkar (listeden çıkış).
 *   • Kutunun hemen arkasında Backspace → kutu kalkar.
 */
export function handleChecklistKey(
  el: HTMLTextAreaElement,
  key: string,
  mods: { shift: boolean; ctrl: boolean; alt: boolean; composing: boolean }
): boolean {
  if (mods.ctrl || mods.alt || mods.composing) return false
  if (el.selectionStart !== el.selectionEnd) return false
  const v = el.value
  const pos = el.selectionStart
  const start = lineStart(v, pos)
  const m = BOX_RE.exec(v.slice(start))
  if (!m) return false
  const prefixEnd = start + m[0].length

  if (key === 'Enter' && !mods.shift && pos >= prefixEnd) {
    const end = lineEnd(v, pos)
    if (v.slice(prefixEnd, end).trim() === '') replaceRange(el, start, end, '')
    else replaceRange(el, pos, pos, `\n${BOX_OPEN} `)
    return true
  }
  if (key === 'Backspace' && pos === prefixEnd) {
    replaceRange(el, start, prefixEnd, '')
    return true
  }
  return false
}
