# GC → Wii U Injector

An Electron re-implementation of [UWUVCI-AIO](https://github.com/stuff-by-3-random-dudes/UWUVCI-AIO-WPF)'s
**GameCube** injection path: wraps a GameCube image in a Wii container with
[Nintendont](https://github.com/FIX94/Nintendont) as its boot DOL, injects that into a
Wii-on-Wii-U Virtual Console base, and packs it as a title you can install to your Wii U
with WUP Installer GX2.

Uses the same external tool set as UWUVCI (downloaded on first run from the
[UWUVCI-Tools](https://github.com/NicoAICP/UWUVCI-Tools) repo, MD5-verified):
`wit`, `nfs2iso2nfs`, `nintendont.dol`, NKit converters, `CDecrypt`, `CNUSPACKER`, image
converters. The UI and pipeline are Node/Electron; the tools are Windows executables
(on macOS/Linux you'd need Wine, same as upstream UWUVCI).

## Quickstart

Get from a GameCube dump to an installable Wii U title in a few minutes. The window walks
top to bottom through four numbered steps:

1. **Download and install.** Grab the latest build from the
   [**latest release**](https://github.com/andrewmunro/gc-wiiu-injector/releases/tag/latest):
   - **Windows:** `GC Wii U Injector-<ver>-x64-Setup.exe` (installer) or `-Portable.exe`.
   - **macOS:** the `.dmg` (unsigned — right-click → **Open** the first time to get past
     Gatekeeper).

   Then launch it. *(Prefer to run from source? See [Run](#run).)*
2. **1 · Setup.** On first run, wait for **Download tools** to finish (tools are fetched and
   MD5-verified into `~/.gc-wiiu-injector/tools/`). Paste your 32‑hex **Wii U common key** and
   click **Save** — without it you only get a loadiine folder, not an installable package.
   While here, click **Save nincfg.bin to SD…** and drop the file on your SD card root
   (Nintendont needs it there or GameCube titles error on launch).
3. **2 · Base title.** Expand **Download a base from NUS**, enter the title ID + title key of
   a Wii U eShop Wii title (Rhythm Heaven Fever is the usual pick), set a name/region, and
   click **Download & decrypt**. Already have a NUS or decrypted dump? Use **Import a base
   folder from disk** instead. Then pick it in the **Base** dropdown.
4. **3 · Options (optional).** Box art auto-fetches from the disc ID by default; tick
   **Force 4:3** if you want it, or set a custom output folder.
5. **4 · Inject.** Under **Source**, **Select file…** to choose one GameCube image (`.iso`,
   `.gcm`, `.ciso`, `.gcz`, `.nkit.iso`, or a `.7z`/`.zip`/`.rar` archive), then click
   **Inject**. To batch-convert many at once, **Select folder…** instead. Output lands in
   `~/.gc-wiiu-injector/output/<name>/`.
6. **Install on console.** Copy the output folder to `SD:/install/<name>/` and run WUP
   Installer GX2 — see [Install on the Wii U](#install-on-the-wii-u) below.

Prefer the terminal? The [CLI](#run) runs the exact same pipeline (including `batch`).

## What you need

1. **A GameCube image** you dumped yourself: `.iso`, `.gcm`, `.ciso`, `.gcz`, or `.nkit.iso`.
2. **A base**: a *Wii U eShop* Wii title (Rhythm Heaven Fever is the usual pick). Either:
   - **NUS download**: enter its title ID + title key in the app (Base → "Download a base"), or
   - **Import**: point the app at a NUS-format folder (`title.tmd` + `.app` files — it will be
     decrypted with CDecrypt), or an already-decrypted dump with `code/content/meta`
     (e.g. dumped from your own console with Dumpling).
   - A `.wbfs`/Wii disc dump is **not** a base — the base must be the Wii U eShop release,
     because injection reuses its `fw.img`, `htk.bin`, and Wii U metadata.
3. **Your Wii U common key** (Settings) — required to produce an installable package.
   Without it you only get a loadiine-format folder. Dump keys from your own console.

## Run

```
npm install
npm start
```

Headless CLI (same pipeline):

```
node src/cli.js tools                          # download/verify tools
node src/cli.js set-key <32-hex common key>
node src/cli.js download-base --tid <16 hex> --key <32 hex> --name "Rhythm Heaven Fever" --region USA
node src/cli.js inject --base "<bases dir>/Rhythm Heaven Fever [USA]" \
    --game "path/to/game.ciso" --name "Game Name" [--force43] [--dont-trim]
```

Data lives in `~/.gc-wiiu-injector/` (tools, bases, temp, output, settings).

## Build installers

Packaged with [electron-builder](https://www.electronjs.org/) (Node 20.19+ or 22+ required):

```
npm run dist:win     # Windows: NSIS installer + portable .exe -> dist/
npm run dist:mac     # macOS: .dmg + .zip (x64 + arm64) -> dist/
npm run dist         # current platform
```

The [`Build` GitHub Actions workflow](.github/workflows/build.yml) builds Windows and macOS
on every push to `main` and refreshes a rolling **[`latest`](../../releases/tag/latest)**
prerelease with the newest installers. Pushing a `v*` tag (e.g. `git tag v0.1.0 && git push
origin v0.1.0`) cuts a permanent versioned Release with auto-generated notes.
macOS artifacts are unsigned (Gatekeeper: right-click → Open).

## Pipeline (port of UWUVCI's GCNInjectService/WitNfsService)

1. Extract `BASE.zip` Wii container skeleton; copy `nintendont.dol` (or `nintendont_force.dol`
   for forced 4:3) to `sys/main.dol`.
2. Game → `files/game.iso`: `.ciso` is de-sparsed in JS, then NKit-trimmed
   (or kept full with *Don't trim*). Optional `files/disc2.iso`.
3. `wit copy` builds the Wii ISO into the base copy's `content/game.iso`.
4. `wit extract` pulls `ticket.bin`/`tmd.bin` → `code/rvlt.tik`/`rvlt.tmd`.
5. `meta.xml`: `reserved_flag2` = disc-id hex; random title ID/group/product code; menu names.
6. Menu images (png/jpg/bmp/tga) → correctly-sized TGAs via png2tga.
7. `nfs2iso2nfs -enc -homebrew -passthrough -iso game.iso` converts the ISO to `.nfs` parts
   (patches the base's `fw.img`, encrypts with its `htk.bin`).
8. `CNUSPACKER` packs `code/content/meta` into an installable title using your common key.

## Install on the Wii U

Copy the output folder to `SD:/install/<name>/`, run WUP Installer GX2 (via the Homebrew
Launcher / Tiramisu / Aroma), install to NAND or USB. GamePad, buttons and sticks work
through Nintendont's passthrough. Nintendont reads `nincfg.bin` from the SD root if you
want to tweak its settings (memcard emulation, cheats, video).

## Tools & credits

This app is a thin Node/Electron front end over the same external tools UWUVCI uses. None of
them are bundled in this repo — they're downloaded on first run from the
[UWUVCI-Tools](https://github.com/NicoAICP/UWUVCI-Tools) mirror (which redistributes patched
builds). Full credit to their authors:

| Tool (files) | Purpose | Source |
| --- | --- | --- |
| **Wiimms ISO Tools** — `wit.exe` (+ `cygwin1.dll`, `cygz.dll`, `cyggcc_s-1.dll`, `cygcrypto-1.1.dll`, `cygncursesw-10.dll`) | Build/extract the Wii ISO and pull ticket/TMD | [Wiimm/wiimms-iso-tools](https://github.com/Wiimm/wiimms-iso-tools) ([site](https://wit.wiimm.de/)); [Cygwin](https://www.cygwin.com/) runtime |
| **NKit** — `ConvertToNKit.exe`, `ConvertToISO.exe`, `NKit.dll`, `NKit.dll.config` | Trim / restore GameCube images | [Nanook/NKit](https://github.com/Nanook/NKit) |
| **nfs2iso2nfs** — `nfs2iso2nfs.exe` | Convert the Wii ISO to `.nfs` and patch `fw.img` (homebrew + GamePad passthrough) | [sabykos/nfs2iso2nfs](https://github.com/sabykos/nfs2iso2nfs) |
| **Nintendont** — `nintendont.dol`, `nintendont_force.dol` | GameCube loader used as the inject's boot DOL | [FIX94/Nintendont](https://github.com/FIX94/Nintendont) |
| **CDecrypt** — `CDecrypt.exe` | Decrypt an imported NUS base | [VitaSmith/cdecrypt](https://github.com/VitaSmith/cdecrypt) (crediar's original, modified v2) |
| **CNUSPACKER** — `CNUSPACKER.exe` | Pack `code/content/meta` into an installable title | [NicoAICP/CNUS_Packer](https://github.com/NicoAICP/CNUS_Packer) |
| **FreeImage converters** — `png2tga.exe`, `jpg2tga.exe`, `bmp2tga.exe`, `FreeImage.dll` | Resize menu/cover art into Wii U TGAs | [FreeImage](https://freeimage.sourceforge.io/) |
| **SharpCompress** — `SharpCompress.dll` | Archive handling for NKit | [adamhathcock/sharpcompress](https://github.com/adamhathcock/sharpcompress) |
| Data assets — `BASE.zip`, `iconTex.tga`, `bootTvTex.png` | Wii container skeleton + default images | [UWUVCI-Tools](https://github.com/NicoAICP/UWUVCI-Tools) |

Cover/icon artwork is fetched from [UWUVCI-IMAGES](https://github.com/UWUVCI-PRIME/UWUVCI-IMAGES),
and the pipeline itself is ported from [UWUVCI-AIO-WPF](https://github.com/stuff-by-3-random-dudes/UWUVCI-AIO-WPF).
Packaging uses [Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/),
with [adm-zip](https://github.com/cthackers/adm-zip) for extraction.

## Legal

Only use games and titles you own and dumped yourself, and keys extracted from your own
console. This project contains no Nintendo code or keys.
