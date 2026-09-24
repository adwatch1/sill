# Sill

**English** · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt-BR.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

![Sill](screenshots/01-edge-panel.png)

**A free notes panel that lives on the edge of your Windows screen.**
Move your mouse to the right edge and a panel slides in, over any window. Move away and it slides back out. No account, no cloud, no tracking.

**[⬇ Download for Windows](../../releases/latest)** · Microsoft Store (coming soon) · **[Website](https://adwatch1.github.io/sill/)**

---

## Features

- **Edge trigger.** Rest the mouse on the middle of the right screen edge, or press `Ctrl + Alt + N`.
- **Two levels of tabs.** Topics across the top, notes on the left. Color, rename and reorder them.
- **Notes that save themselves.** No save button.
- **Images.** Drag and drop, paste with `Ctrl + V`, or right-click → Add image.
- **Audio & voice notes.** Drop audio files, or record from your microphone with a live waveform.
- **YouTube cards.** Paste a YouTube link and it becomes a card with the thumbnail and title.
- **10 languages.** Follows your Windows language automatically.
- Light and dark themes, pin to keep open, resizable panel, start with Windows.

| | |
|---|---|
| ![](screenshots/02-media.png) | ![](screenshots/03-voice.png) |
| ![](screenshots/04-tabs.png) | ![](screenshots/05-private.png) |

## Install

Download `Sill-Setup-x.y.z.exe` from [Releases](../../releases/latest) and run it (no administrator rights needed). The direct download isn’t code-signed yet, so Windows may warn the first time: **More info → Run anyway**. A Microsoft Store version, signed by Microsoft and updating itself, is coming soon.

## Privacy

Your notes, images, audio and settings stay only on your computer. Sill goes online in one case only: when you paste a YouTube link, it downloads that video’s thumbnail and title once (you can turn this off in Settings → Privacy). The microphone is used only while you record. [Privacy policy](https://adwatch1.github.io/sill/privacy.html)

## Support

Sill is free. If you like it, you can [buy me a coffee ☕](https://buymeacoffee.com/stilless).

## Source code

```bash
npm install
npm run dev         # run in development mode
npm run dist        # installer → dist/Sill-Setup-<version>.exe
npm run dist:store  # Microsoft Store package (MSIX)
```

## License

Free to download and use. © 2026 stilless. All rights reserved. The source code is public for transparency but is not open source — see [LICENSE](LICENSE).
Contact: [mailatikleri@gmail.com](mailto:mailatikleri@gmail.com)

---

<sub>Screenshots use sample content. Video thumbnail: *Big Buck Bunny* © Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).</sub>
