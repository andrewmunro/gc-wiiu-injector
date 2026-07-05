// Generates a Nintendont nincfg.bin (548-byte / version 10 format), ported from
// UWUVCI's NintendontConfig + NintendontConfigService. Nintendont reads this
// from the SD card root; without it, injected GC titles error on launch.

const MAGIC = 0x01070cf6;
const VERSION = 10;

// config bitfield flags
const F = {
  CHEATS: 1 << 0,
  MEMCARDEMU: 1 << 3,
  CHEAT_PATH: 1 << 4,
  FORCE_WIDE: 1 << 5,
  FORCE_PROG: 1 << 6,
  AUTO_BOOT: 1 << 7,
  OSREPORT: 1 << 9,
  LOG: 1 << 12,
  MC_MULTI: 1 << 13,
  WIIU_WIDE: 1 << 15,
  CC_RUMBLE: 1 << 17,
  REMLIMIT: 1 << 18,
};
// video bitfield
const V = {
  FORCE: 1 << 16,
  NONE: 2 << 16,
  FORCE_NTSC: 1 << 2,
  FORCE_PAL50: 1 << 0,
  FORCE_PAL60: 1 << 1,
  PROG: 1 << 4,
  PATCH_PAL50: 1 << 5,
};

// Mirrors NintendontPresets. `Recommended` is UWUVCI's default and works for
// Wii U GC injects. Video is left on Auto so an NTSC game runs on a PAL console.
// autoBoot is on: each injected title embeds exactly one game, so we skip
// Nintendont's TV menu and boot straight in — this is where the Wii U GamePad
// takes over from the vWii "look at TV" screen. wiiuGamepadSlot 0 = Player 1.
const PRESETS = {
  recommended: { memcardEmu: true, memcardMulti: true, cheats: true, ccRumble: true, forceProgressive: true, autoBoot: true, maxPads: 4, wiiuGamepadSlot: 0 },
  compatibility: { memcardEmu: true, ccRumble: true, autoBoot: true, maxPads: 4, wiiuGamepadSlot: 0 },
  widescreen: { memcardEmu: true, ccRumble: true, forceWide: true, forceProgressive: true, autoBoot: true, maxPads: 4, wiiuGamepadSlot: 0 },
};

function buildNincfg(opts = {}) {
  const o = { preset: 'recommended', forceVideo: null, ...opts };
  const base = PRESETS[o.preset] || PRESETS.recommended;
  const c = { memcardBlocks: 0, language: 0, wiiuGamepadSlot: 0, ...base, ...o };

  let cfg = 0;
  if (c.cheats) cfg |= F.CHEATS;
  if (c.memcardEmu) cfg |= F.MEMCARDEMU;
  if (c.memcardMulti) cfg |= F.MC_MULTI;
  if (c.ccRumble) cfg |= F.CC_RUMBLE;
  if (c.forceProgressive) cfg |= F.FORCE_PROG;
  if (c.forceWide) cfg |= F.FORCE_WIDE | F.WIIU_WIDE;
  if (c.autoBoot) cfg |= F.AUTO_BOOT;

  let vid = 0;
  if (c.forceProgressive) vid |= V.PROG;
  // Optional video-mode force (helps if an NTSC game won't sync on a PAL set, or vice versa)
  if (c.forceVideo === 'ntsc') vid |= V.FORCE | V.FORCE_NTSC;
  else if (c.forceVideo === 'pal60') vid |= V.FORCE | V.FORCE_PAL60;
  else if (c.forceVideo === 'pal50') vid |= V.FORCE | V.FORCE_PAL50;

  const language = c.language <= 0 ? 0xffffffff : (c.language - 1) >>> 0;

  const buf = Buffer.alloc(548);
  let p = 0;
  const u32 = (v) => { buf.writeUInt32BE(v >>> 0, p); p += 4; };
  u32(MAGIC);
  u32(VERSION);
  u32(cfg);
  u32(vid);
  u32(language);
  p += 256; // GamePath (empty)
  p += 256; // CheatPath (empty)
  u32(Math.max(1, Math.min(4, c.maxPads || 4)));
  u32(0); // GameId (0 = applies to any)
  buf.writeUInt8(Math.max(0, Math.min(5, c.memcardBlocks)), p++); // MemcardBlocks
  buf.writeInt8(0, p++); // VideoScale (0 = auto width)
  buf.writeInt8(0, p++); // VideoOffset
  buf.writeUInt8(0, p++); // NetworkProfile
  u32(Math.max(0, Math.min(3, c.wiiuGamepadSlot))); // WiiUGamepadSlot -> 548 bytes
  return buf;
}

module.exports = { buildNincfg, PRESETS };
