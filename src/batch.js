const fs = require('fs');
const path = require('path');
const os = require('os');
const { paths } = require('./paths');
const { run } = require('./run');
const { inject } = require('./inject');

const IMAGE_EXTS = ['.iso', '.gcm', '.ciso', '.gcz'];
const ARCHIVE_EXTS = ['.7z', '.zip', '.rar'];

function find7z() {
  const candidates = [
    process.env.SEVENZIP,
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    '7z',
    '7za',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c === '7z' || c === '7za') return c; // assume on PATH
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function cleanName(file) {
  return path
    .basename(file, path.extname(file))
    .replace(/\.nkit$/i, '')
    .replace(/\s*[([].*?[)\]]\s*/g, ' ') // strip (USA), [!], (En,Fr,...) etc.
    .replace(/\s+/g, ' ')
    .trim();
}

// List archive members without extracting, to find the GC image inside.
async function listArchive(sevenZip, archive) {
  const { output } = await run(sevenZip, ['l', '-slt', archive], { ignoreExitCode: true });
  return output
    .split(/\r?\n/)
    .filter((l) => l.startsWith('Path = '))
    .map((l) => l.slice(7).trim())
    .filter((p) => p && p !== path.basename(archive));
}

async function extractMember(sevenZip, archive, member, destDir, log) {
  fs.mkdirSync(destDir, { recursive: true });
  // -so streams the member to stdout; write it to a file to avoid path quirks.
  await run(sevenZip, ['e', '-y', `-o${destDir}`, archive, member], { log, ignoreExitCode: true });
  const out = path.join(destDir, path.basename(member));
  if (!fs.existsSync(out)) throw new Error(`Extraction did not yield ${member}`);
  return out;
}

/**
 * Resolve every game source in a folder to an on-disk GC image path.
 * Loose images are used directly; archives are extracted to a staging dir.
 * Returns [{ name, gamePath, cleanup }].
 */
async function resolveGames(dir, { log = () => {} } = {}) {
  const entries = fs.readdirSync(dir).map((f) => path.join(dir, f));
  const sevenZip = find7z();
  const games = [];

  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (IMAGE_EXTS.includes(ext)) {
      games.push({ name: cleanName(entry), gamePath: entry, cleanup: null });
    } else if (ARCHIVE_EXTS.includes(ext)) {
      if (!sevenZip) {
        log(`Skipping ${path.basename(entry)} — 7-Zip not found (install it or set SEVENZIP).`);
        continue;
      }
      const members = await listArchive(sevenZip, entry);
      const image = members.find((m) => IMAGE_EXTS.includes(path.extname(m).toLowerCase()));
      if (!image) {
        log(`Skipping ${path.basename(entry)} — no GC image inside.`);
        continue;
      }
      // Stage OUTSIDE paths.temp — inject() wipes paths.temp at its start.
      const stage = path.join(paths.dataRoot, 'batchsrc', cleanName(entry));
      games.push({
        name: cleanName(entry),
        archive: entry,
        member: image,
        sevenZip,
        stage,
        get gamePath() {
          return this._gamePath;
        },
        cleanup() {
          fs.rmSync(this.stage, { recursive: true, force: true });
        },
      });
    }
  }
  return games;
}

/**
 * Inject every game found in `dir` against a shared base. Continues past
 * failures; returns a per-game result summary.
 */
async function batchInject(opts, { onProgress = () => {}, log = () => {} } = {}) {
  const games = await resolveGames(opts.dir, { log });
  if (!games.length) throw new Error(`No GC images or archives found in ${opts.dir}`);

  log(`Found ${games.length} game(s) to process.`);
  const results = [];
  const maxConcurrent = Math.max(1, Math.min(os.cpus().length, games.length));
  let idx = 0;

  async function processOne() {
    const i = idx++;
    if (i >= games.length) return;
    const g = games[i];
    const label = `[${i + 1}/${games.length}] ${g.name}`;
    const tempDir = path.join(paths.temp, 'batch', g.name.replace(/[^a-z0-9]/gi, '_'));
    log(`\n===== ${label} =====`);
    try {
      let gamePath = g.gamePath;
      if (g.archive) {
        log(`Extracting ${path.basename(g.member)} from archive...`);
        gamePath = await extractMember(g.sevenZip, g.archive, g.member, g.stage, log);
        g._gamePath = gamePath;
      }
      const res = await inject(
        {
          baseDir: opts.baseDir,
          gamePath,
          gameName: g.name,
          force43: opts.force43,
          dontTrim: opts.dontTrim,
          autoFetchImages: opts.autoFetchImages !== false,
          outDir: opts.outDir,
          commonKey: opts.commonKey,
          tempDir,
        },
        { onProgress: (pct, msg) => onProgress({ index: i, total: games.length, pct, msg, name: g.name }), log: (line) => log({ index: i, line }) }
      );
      results.push({ name: g.name, ok: true, outPath: res.outPath, titleId: res.titleId });
      log(`✓ ${label} -> ${res.outPath}`);
    } catch (e) {
      results.push({ name: g.name, ok: false, error: e.message });
      log(`✗ ${label} FAILED: ${e.message}`);
    } finally {
      try { g.cleanup && g.cleanup(); } catch {}
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }

  const workers = Array.from({ length: maxConcurrent }, () => processOne());
  await Promise.all(workers);
  return results;
}

module.exports = { batchInject, resolveGames, find7z };
