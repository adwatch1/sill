// İngilizce / Türkçe geçişi. İlk açılışta tarayıcının dili, sonra ziyaretçinin seçimi (sadece kendi tarayıcısında).
(function () {
  var html = document.documentElement
  var saved = null
  try { saved = localStorage.getItem('sill-lang') } catch (e) {}
  var lang = saved || ((navigator.language || '').toLowerCase().indexOf('tr') === 0 ? 'tr' : 'en')
  var btn = document.getElementById('lang')
  function apply(l) {
    html.lang = l
    if (btn) btn.textContent = l === 'tr' ? 'EN' : 'TR'
  }
  apply(lang)
  if (btn) btn.addEventListener('click', function () {
    lang = html.lang === 'tr' ? 'en' : 'tr'
    try { localStorage.setItem('sill-lang', lang) } catch (e) {}
    apply(lang)
  })
})()
