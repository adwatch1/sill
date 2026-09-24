// Dil seçimi. Her dilin kendi sayfası var (/tr/, /de/…); seçim o sayfaya götürür ve hatırlanır.
// Ana sayfaya ilk kez gelen ziyaretçi, tarayıcısının dili destekleniyorsa bir kez o dile yönlendirilir.
(function () {
  var sel = document.getElementById('lang')
  if (sel) sel.addEventListener('change', function () {
    var code = sel.options[sel.selectedIndex].getAttribute('lang')
    try { localStorage.setItem('sill-lang', code) } catch (e) {}
    location.href = sel.value
  })

  var html = document.documentElement
  var isRoot = html.lang === 'en' && !/\/(tr|de|fr|es|pt-BR|it|ru|ja|zh-CN)\//.test(location.pathname)
  if (!isRoot) return
  var saved = null
  try { saved = localStorage.getItem('sill-lang') } catch (e) {}
  if (saved) return // ziyaretçi bir kez seçtiyse ona saygı
  var map = { tr: 'tr', de: 'de', fr: 'fr', es: 'es', pt: 'pt-BR', it: 'it', ru: 'ru', ja: 'ja', zh: 'zh-CN' }
  var langs = navigator.languages || [navigator.language || 'en']
  for (var i = 0; i < langs.length; i++) {
    var base = (langs[i] || '').toLowerCase().split('-')[0]
    if (base === 'en') return
    if (map[base]) {
      var page = /privacy\.html$/.test(location.pathname) ? 'privacy.html' : ''
      location.replace(map[base] + '/' + page)
      return
    }
  }
})()
