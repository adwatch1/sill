// GitHub sürümüne yüklenecek üç dosyayı SABİT adlarla hazırlar (dist/release/):
//   SillNote-Setup.exe     kurulum
//   SillNote-Setup.zip     aynı kurulum, ZIP içinde (.exe indirmeyi engelleyen tarayıcı / e-posta için)
//   SillNote-Portable.zip  kurulumsuz sürüm: aç, Sill.exe'yi çalıştır
// Sabit ad şart: sitedeki indirme linkleri ".../releases/latest/download/<ad>" ile hep son sürümü alır.
// Kullanım: npm run dist → npm run release-files
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const out = join('dist', 'release')
const setup = join('dist', `SillNote-Setup-${version}.exe`)
// Taşınabilir sürüm = electron-builder'ın zaten ürettiği kurulumsuz klasör (dist/win-unpacked).
const unpacked = join('dist', 'win-unpacked')
for (const f of [setup, join(unpacked, 'Sill.exe')]) {
  if (!existsSync(f)) throw new Error(`${f} yok — önce "npm run dist"`)
}
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

copyFileSync(setup, join(out, 'SillNote-Setup.exe'))
// Windows'un kendi ZIP'leyicisi (ek paket gerekmesin)
const zip = (path, dest) =>
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${path}' -DestinationPath '${dest}' -Force`])
zip(join(out, 'SillNote-Setup.exe'), join(out, 'SillNote-Setup.zip'))
// Taşınabilir: 89 dosya ZIP'in köküne dağılmasın, tek bir "Sill Note" klasöründe dursun.
const stage = join(out, 'stage', 'Sill Note')
cpSync(unpacked, stage, { recursive: true })
zip(stage, join(out, 'SillNote-Portable.zip'))
rmSync(join(out, 'stage'), { recursive: true, force: true })
console.log(`hazır: ${out} (sürüm ${version})`)
