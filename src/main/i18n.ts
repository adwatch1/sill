import { app } from 'electron'
import { resolveLang, translator, type Translate } from '../shared/i18n'
import { getSettings } from './settings'

/** Arka planın o anki çevirmeni (tepsi menüsü, dosya pencereleri, hata mesajları). Ayar değişince hemen uyar. */
export const mt = (): Translate => translator(currentLang())

/** Ayar + Windows dili → kullanılacak dil. */
export const currentLang = () => resolveLang(getSettings().language, app.getLocale())
