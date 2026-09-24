# Sill

![Sill — notes, right on the edge](screenshots/01-edge-panel.png)

**A notes panel that lives on the edge of your Windows screen.**
Move the mouse to the right edge and a panel slides in. Move away and it slides back out.

Sill keeps everything on your computer. It has no account and no cloud, and nothing is sent anywhere
(the one exception is described under [Privacy](#privacy)).

**[⬇ Download for Windows](../../releases/latest)** · Microsoft Store *(coming soon)* · **[Website](https://adwatch1.github.io/sill/)** · free · [Türkçe açıklama aşağıda ↓](#türkçe)

---

## A quick tour

| | |
|---|---|
| ![Images, audio and YouTube in one note](screenshots/02-media.png) | ![Just talk. It’s saved.](screenshots/03-voice.png) |
| **Images, audio and YouTube in one note.** Drop an image, drop an audio file or paste a YouTube link, and it all sits inside your note. | **Just talk. It’s saved.** A live waveform shows while you record, and you can switch microphones mid-recording. The microphone turns off the moment you stop. |
| ![Two levels of tabs, in color](screenshots/04-tabs.png) | ![Your notes stay yours.](screenshots/05-private.png) |
| **Two levels of tabs, in color.** Tabs run across the top and notes sit on the left. Color, rename and reorder them. Light and dark themes are included. | **Your notes stay yours.** There is no account, cloud or tracking. Your notes never leave your computer. |

## Features

- **Edge trigger.** Rest the mouse on the middle of the right screen edge and the panel slides in. It
  slides back out when the mouse leaves. Click inside the panel to keep it open, or pin it.
- **Keyboard shortcut.** The default is `Ctrl + Alt + N`, and you can change it.
- **Two levels of tabs.** Tabs run across the top, and each tab has its own list of notes on the left.
  You can color, rename and delete tabs, and reorder them by holding and dragging.
- **Plain-text notes that save themselves.** There is no save button, and the file is written safely.
- **Images.** Add images by drag and drop, by pasting (`Ctrl + V`) or with *Right-click → Add image…*. They
  appear in a two-column grid, and a click opens an image full screen.
- **Audio.** Drop audio files into a note (MP3, WAV, M4A, OGG, Opus, FLAC, WebM) to get a small player.
- **Voice notes.** Record from your microphone, choose which microphone to use, and watch a live waveform.
- **YouTube links.** Paste a YouTube link on its own and it becomes a video card with a thumbnail and the
  title. Clicking the card opens the video in your browser.
- Light and dark themes, a resizable panel, and an option to start with Windows.

## Install

Download `Sill-Setup-x.y.z.exe` from the [Releases](../../releases/latest) page and run it. It installs for your user
only and needs no administrator rights. A Microsoft Store version (signed by Microsoft, with automatic updates) is
coming soon.

> The direct download is not code-signed yet, so Windows SmartScreen may warn you the first time:
> choose **More info → Run anyway**.

## Privacy

- Notes, settings and attachments are stored only on your computer.
- Sill has no accounts, analytics or telemetry, and it does not check for updates.
- **The one network request:** when you paste a YouTube link, Sill downloads that video's thumbnail and
  title **once**, from YouTube. After that the card works offline. You can turn this off in
  *Settings → Privacy → Link previews*.
- The microphone is used only while you are recording. It is released as soon as the recording stops,
  is cancelled, or the panel closes.

## Support

Sill is free. If you like it, you can [buy me a coffee ☕](https://buymeacoffee.com/stilless).
You can also find the button in *Settings → Support*.

## Source code

The source code is public so anyone can see exactly what Sill does. It is **not** open source. See the license below.

```bash
npm install
npm run dev         # run in development mode
npm run dist        # installer → dist/Sill-Setup-<version>.exe
npm run dist:store  # Microsoft Store package (MSIX)
```

## License & contact

Free to download and use. © 2026 stilless. All rights reserved. See [LICENSE](LICENSE).
Contact: [mailatikleri@gmail.com](mailto:mailatikleri@gmail.com) ·
[Privacy policy](https://adwatch1.github.io/sill/privacy.html)

---

## Türkçe

**Windows ekranının kenarında yaşayan bir not paneli.** Fareyi sağ kenara götürünce panel kayarak açılır.
Fare uzaklaşınca geri çekilir.

Her şey bilgisayarında kalır. Hesap yok, bulut yok, hiçbir şey bir yere gönderilmez. Tek istisna
YouTube link kartıdır, aşağıda anlatılıyor.

**Neler yapabilir:**
- İki katlı sekmeler: üstte ana başlıklar, solda her başlığın kendi notları.
- Kendiliğinden kaydedilen notlar.
- Görsel ekleme: sürükle-bırak, yapıştırma ya da sağ tık.
- Ses dosyası çalma ve mikrofonla sesli not kaydı.
- YouTube linki yapıştırınca küçük resimli video kartı.
- Açık ve koyu tema, klavye kısayolu, Windows açılışında başlatma.

**Kurulum:** [Releases](../../releases/latest) sayfasından `Sill-Setup-x.y.z.exe` dosyasını indirip çalıştır (yönetici
izni istemez). İmzasız olduğu için Windows ilk seferde uyarabilir: **Ek bilgi → Yine de çalıştır**. Microsoft Store
sürümü yakında (Microsoft imzalı, kendiliğinden güncellenir). ⚠️ Mağaza uygulaması kaldırılınca verileri de silinir; kaldırmadan önce
not klasörünü kopyala (*Ayarlar → Notların klasörü → Klasörü aç*).

**Gizlilik:** notların sadece senin bilgisayarında durur. Sill'in internete çıktığı tek an, bir YouTube
linki yapıştırdığında o videonun küçük resmini ve başlığını **bir kez** indirmesidir. Bunu
*Ayarlar → Gizlilik → Link önizlemeleri* ile kapatabilirsin. Mikrofon sadece kayıt sırasında açıktır.

**Destek:** Sill ücretsiz. Beğendiysen [bir kahve ısmarlayabilirsin ☕](https://buymeacoffee.com/stilless)
(*Ayarlar → Destek*).

**Lisans:** indirmek ve kullanmak ücretsiz. © 2026 stilless. Tüm hakları saklıdır. Kaynak kod şeffaflık için
açıktır ama açık kaynak lisanslı değildir. **İletişim:** [mailatikleri@gmail.com](mailto:mailatikleri@gmail.com) ·
[Web sitesi](https://adwatch1.github.io/sill/)

---

<sub>Screenshots use sample content. Video thumbnail: *Big Buck Bunny* © Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).</sub>
