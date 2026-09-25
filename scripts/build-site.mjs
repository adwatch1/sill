// Tanıtım sitesini üretir: site-src/ (şablon + sözlük) → site/ (her dil için ayrı, önceden doldurulmuş sayfa).
// Neden ayrı sayfalar: arama motorları dili JS ile sonradan değişen sayfanın sadece ilk hâlini görür.
// Her dilin kendi adresi (/tr/, /de/…), başlığı, açıklaması ve anahtar kelimeleri olunca o dilde aranınca bulunur.
// Kullanım: npm run site
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'https://www.sillnote.store/'
const LANGS = [
  ['en', 'English'], ['tr', 'Türkçe'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'],
  ['pt-BR', 'Português (Brasil)'], ['it', 'Italiano'], ['ru', 'Русский'], ['ja', '日本語'], ['zh-CN', '简体中文']
]
const T = JSON.parse(readFileSync('site-src/strings.json', 'utf8'))
const SEO = JSON.parse(readFileSync('site-src/seo.json', 'utf8'))
const PAGES = ['index.html', 'privacy.html']
// Sitede görünen sürüm programla aynı kaynaktan gelir: her yeni sürümde elle güncellemek gerekmez.
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const dir = (lang) => (lang === 'en' ? '' : `${lang}/`)
const url = (lang, page) => BASE + dir(lang) + (page === 'index.html' ? '' : page)

function render(tpl, lang, page) {
  const d = T[lang]
  const seo = SEO[lang]
  const root = lang === 'en' ? '' : '../'
  // 1) Sayfadaki yazılar (data-i18n) — sözlükten doldurulur, JS'e gerek kalmaz.
  let html = tpl.replace(/(<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, key, inner, close) => {
    const v = d[key] ?? T.en[key]
    return open + (v ?? inner) + close
  })
  // İpucu yazıları (title) da sözlükten: data-i18n-title="anahtar" → title="…"
  html = html.replace(/data-i18n-title="([^"]+)"/g, (m, key) => `title="${esc(d[key] ?? T.en[key] ?? '')}"`)
  // 2) Ekran görüntüleri: Türkçe sayfada Türkçe arayüzlü set, diğerlerinde İngilizce.
  html = html.replace(/src="img\/([\w-]+)\.png" data-tr="img\/[\w-]+-tr\.png"/g, (m, n) =>
    lang === 'tr' ? `src="img/${n}-tr.png"` : `src="img/${n}.png"`)
  // 3) Alt klasördeki sayfalar ortak dosyalara bir üst klasörden ulaşır.
  html = html.replace(/(src|href)="(img\/|style\.css)/g, `$1="${root}$2`)
  // 4) Baş kısım: başlık, açıklama, anahtar kelimeler, dil kardeşleri, yapılandırılmış veri.
  const isIndex = page === 'index.html'
  const hreflang = LANGS.map(([l]) => `<link rel="alternate" hreflang="${l}" href="${url(l, page)}">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${url('en', page)}">`).join('\n')
  const jsonld = isIndex
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Sill Note',
        alternateName: 'Sill',
        applicationCategory: 'ProductivityApplication',
        operatingSystem: 'Windows 10, Windows 11',
        softwareVersion: VERSION,
        description: seo.desc,
        keywords: seo.keywords,
        inLanguage: LANGS.map(([l]) => l),
        url: url(lang, page),
        downloadUrl: 'https://github.com/adwatch1/sill-note/releases/latest/download/SillNote-Setup.exe',
        screenshot: BASE + 'img/hero-step2.png',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        author: { '@type': 'Organization', name: 'stilless' }
      })}</script>`
    : ''
  const options = LANGS.map(([l, name]) =>
    `<option value="${root}${dir(l)}${isIndex ? '' : page}"${l === lang ? ' selected' : ''} lang="${l}">${name}</option>`).join('')
  const vars = {
    lang, root, hreflang, jsonld, langOptions: options, version: VERSION,
    title: esc(isIndex ? seo.title : seo.privTitle),
    desc: esc(isIndex ? seo.desc : seo.privDesc),
    keywords: esc(seo.keywords),
    canonical: url(lang, page),
    ogLocale: seo.ogLocale
  }
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m))
  return html
}

for (const page of PAGES) {
  const tpl = readFileSync(join('site-src', page), 'utf8')
  for (const [lang] of LANGS) {
    const outDir = join('site', dir(lang))
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, page), render(tpl, lang, page))
  }
}

// Site haritası + robots: arama motorlarına 20 sayfanın hepsini söyler.
const today = new Date().toISOString().slice(0, 10)
const urls = PAGES.flatMap((p) => LANGS.map(([l]) => url(l, p)))
writeFileSync('site/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`)
writeFileSync('site/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`)
console.log(`site: ${PAGES.length * LANGS.length} sayfa + sitemap.xml + robots.txt`)
