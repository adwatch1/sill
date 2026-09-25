import { app } from 'electron'

// Panelin sabit davranış değerleri. Kullanıcının değiştirebildikleri (genişlik, tetik bölgesi,
// açılma gecikmesi, kısayol, tema) → src/shared/settings.ts + Ayarlar ekranı.

export const PANEL = {
  heightRatio: 0.85, // çalışma alanı yüksekliğinin ne kadarını kaplasın
  // Pencere, gölgenin sığması için panelden biraz büyük ve şeffaf.
  // Bu değerler renderer'daki --panel-pad-* CSS değişkenleriyle AYNI olmalı.
  padShadow: 28, // üst, alt ve sol şeffaf pay
  padEdge: 8 // panel ile ekranın sağ kenarı arasındaki boşluk
}

export const TRIGGER_EDGE_PX = 2 // ekranın en sağındaki kaç piksel tetik sayılır
export const CLOSE_DELAY_MS = 400 // mouse panelden çıktıktan sonra kapanmadan önce bekleme
export const POLL_MS = 33 // mouse konumunu kontrol sıklığı (~30 kez/sn)
export const EXIT_FALLBACK_MS = 700 // kapanış animasyonu haber vermezse yine de gizle
export const FULLSCREEN_POLL_MS = 250 // öndeki pencere tam ekran mı? kontrol sıklığı
export const FULLSCREEN_EXIT_MS = 1000 // tam ekrandan çıktıktan sonra duraklatmanın bitmesi için bekleme

// Kurulumdan sonraki ilk açılış: panel kendini bir kez gösterip geri çekilir ki
// kullanıcı programın ekranın neresinde yaşadığını görsün.
export const INTRO_DELAY_MS = 900 // pencere ve arayüz hazır olsun diye kısa bekleme
export const INTRO_HOLD_MS = 2600 // ekranda kalma süresi

/**
 * Microsoft Store (MSIX) paketi olarak mı çalışıyoruz? Mağaza sürümünde bazı şeyler farklı:
 * Windows açılışında başlatma paketin "başlangıç görevi"yle yapılır ve Windows Ayarları'ndan
 * yönetilir; notlar Windows'un pakete ayırdığı özel klasöre yazılır.
 * Geliştirmede SILL_FAKE_STORE=1 ile mağaza davranışı denenebilir.
 */
export const IS_STORE = process.windowsStore === true || (!app.isPackaged && process.env.SILL_FAKE_STORE === '1')
