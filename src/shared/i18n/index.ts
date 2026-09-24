// Programın dilleri — arka plan ve arayüz ortak kullanır.
// Kaynak sözlük Türkçe (tr.ts); her dil aynı anahtarları taşır. Yeni bir yazı eklenince önce tr.ts'e,
// sonra diğer dillere eklenir — eksik kalırsa `npm run typecheck` hata verir.
import { tr } from './tr'
import { en } from './en'
import { de } from './de'
import { fr } from './fr'
import { es } from './es'
import { ptBR } from './pt-BR'
import { it } from './it'
import { ru } from './ru'
import { ja } from './ja'
import { zhCN } from './zh-CN'

export type Key = keyof typeof tr
export type Dict = Record<Key, string>

/** Menüde görünen sırayla. `name` her dilin kendi adı (kullanıcı kendi dilini tanısın). */
export const LANGS = [
  { code: 'en', name: 'English', locale: 'en-US' },
  { code: 'tr', name: 'Türkçe', locale: 'tr-TR' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'pt-BR', name: 'Português (Brasil)', locale: 'pt-BR' },
  { code: 'it', name: 'Italiano', locale: 'it-IT' },
  { code: 'ru', name: 'Русский', locale: 'ru-RU' },
  { code: 'ja', name: '日本語', locale: 'ja-JP' },
  { code: 'zh-CN', name: '简体中文', locale: 'zh-CN' }
] as const

export type Lang = (typeof LANGS)[number]['code']
/** Ayar: 'system' = Windows'un dilini izle. */
export type LangPref = 'system' | Lang

const DICTS: Record<Lang, Dict> = { en, tr, de, fr, es, 'pt-BR': ptBR, it, ru, ja, 'zh-CN': zhCN }

export const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v)
export const isLangPref = (v: unknown): v is LangPref => v === 'system' || isLang(v)

/**
 * Ayar + sistem dili → kullanılacak dil. Windows dili listede yoksa İngilizce.
 * Portekizcenin her türü Brezilya sözlüğünü, Çincenin her türü basitleştirilmişi kullanır.
 */
export function resolveLang(pref: LangPref, systemLocale: string): Lang {
  if (pref !== 'system') return pref
  const loc = (systemLocale || '').toLowerCase()
  const base = loc.split(/[-_]/)[0]
  if (base === 'pt') return 'pt-BR'
  if (base === 'zh') return 'zh-CN'
  return isLang(base) ? base : 'en'
}

/** Tarih/sayı biçimi için tam bölge kodu (ör. 'de-DE'). */
export const localeOf = (lang: Lang): string => LANGS.find((l) => l.code === lang)?.locale ?? 'en-US'

export type Translate = (key: Key, vars?: Record<string, string | number>) => string

/** Verilen dilin çevirmeni. Bulunamayan anahtar İngilizceye, o da yoksa anahtarın kendisine düşer. */
export function translator(lang: Lang): Translate {
  const dict = DICTS[lang] ?? en
  return (key, vars) => {
    let s = dict[key] ?? en[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
    return s
  }
}
