import { useSyncExternalStore } from 'react'
import { localeOf, resolveLang, translator, type Lang, type LangPref, type Translate } from '../../shared/i18n'

// Arayüzün o anki dili. Ayar değişince bütün parçalar yeniden çizilir (useI18n abone olur).
// "Sistem" = Windows'un dili; Electron bunu navigator.language olarak verir.

interface I18nState {
  lang: Lang
  /** Tarih biçimi için tam bölge kodu (ör. 'de-DE'). */
  locale: string
  t: Translate
}

const make = (lang: Lang): I18nState => ({ lang, locale: localeOf(lang), t: translator(lang) })

let state = make(resolveLang('system', navigator.language))
const listeners = new Set<() => void>()

export function setLanguagePref(pref: LangPref): void {
  const lang = resolveLang(pref, navigator.language)
  document.documentElement.lang = lang
  if (lang === state.lang) return
  state = make(lang)
  listeners.forEach((fn) => fn())
}

/** Hook dışında (ör. kayıt hataları) o anki çevirmen. */
export const getT = (): Translate => state.t

export function useI18n(): I18nState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state
  )
}
