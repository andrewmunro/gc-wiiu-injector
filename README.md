# GC → Wii U Injector

An Electron re-implementation of [UWUVCI-AIO](https://github.com/UWUVCI-Prime/UWUVCI-AIO-WPF)'s
**GameCube** injection path: wraps a GameCube image in a Wii container with
[Nintendont](https://github.com/FIX94/Nintendont) as its boot DOL, injects that into a
Wii-on-Wii-U Virtual Console base, and packs it as a title you can install to your Wii U
with WUP Installer GX2.

Uses the same external tool set as UWUVCI (downloaded on first run from the
[UWUVCI-Tools](https://github.com/Hotbrawl20/UWUVCI-Tools) repo, MD5-verified):
`wit`, `nfs2iso2nfs`, `nintendont.dol`, NKit converters, `CDecrypt`, `CNUSPACKER`, image
converters. The UI and pipeline are Node/Electron; the tools are Windows executables
(on macOS/Linux you'd need Wine, same as upstream UWUVCI).

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

## Legal

Only use games and titles you own and dumped yourself, and keys extracted from your own
console. This project contains no Nintendo code or keys.
