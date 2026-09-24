import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Dağıtılan pakette kod sıkıştırılır: açıklama satırları ve iç notlar programın içine girmez,
  // kaynak haritası (sourcemap) üretilmez.
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { minify: true, sourcemap: false }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      minify: true,
      sourcemap: false,
      rollupOptions: {
        // İki köprü: panel ve büyütme penceresi. Büyütmeninki bilerek çok dar.
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          lightbox: resolve(__dirname, 'src/preload/lightbox.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      minify: true,
      sourcemap: false,
      rollupOptions: {
        // Panel ve büyütme penceresi AYRI sayfalar. Aynı sayfa kullanılsaydı büyütme
        // penceresi de not deposunu kurar ve iki pencere aynı anda data.json'a yazardı.
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          lightbox: resolve(__dirname, 'src/renderer/lightbox.html')
        }
      }
    }
  }
})
