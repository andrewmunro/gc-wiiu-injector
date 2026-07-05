const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { paths } = require('./paths');
const { toolPath } = require('./tools');
const { run } = require('./run');
const { editBaseXmls, setReservedFlag2 } = require('./xml');
const { convertImage } = require('./images');

function newestMatch(dir, suffix, since) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(suffix))
    .map((f) => path.join(dir, f))
    .map((f) => ({ f, t: fs.statSync(f).mtimeMs }))
    .filter((x) => x.t >= since)
    .sort((a, b) => b.t - a.t);
  return files.length ? files[0].f : null;
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').trim() || 'GC Inject';
}

/**
 * NKit converters write their output next to the exe (tools dir) with a name
 * we can't fully predict, so run them and grab the newest matching output.
 */
async function nkitConvert(exeName, sourcePath, outSuffix, log) {
  const exe = toolPath(exeName);
  const started = Date.now() - 1000;
  await run(exe, [sourcePath], { cwd: paths.tools, log, ignoreExitCode: true });
  const produced = newestMatch(paths.tools, outSuffix, started);
  if (!produced) throw new Error(`${exeName} produced no ${outSuffix} output for ${sourcePath}`);
  return produced;
}

/**
 * Prepare the GameCube image that gets embedded in the Wii container.
 * Mirrors UWUVCI's PlacePrimaryGame, with an extra wit conversion step so
 * .ciso/.wbfs-style inputs also work.
 */
async function prepareGameFile(sourcePath, targetPath, { dontTrim, log }) {
  const lower = sourcePath.toLowerCase();
  const isNkit = lower.includes('.nkit.');
  const ext = path.extname(lower);

  // Normalize compressed formats NKit can't read (ciso) to plain ISO.
  if (ext === '.ciso') {
    log('Decoding .ciso to plain ISO...');
    const { cisoToIso } = require('./ciso');
    const tmpIso = path.join(paths.temp, 'ciso_conv.iso');
    fs.rmSync(tmpIso, { force: true });
    cisoToIso(sourcePath, tmpIso);
    sourcePath = tmpIso;
  }

  if (dontTrim) {
    if (isNkit || ext === '.gcz') {
      log('Converting to full ISO (NKit)...');
      const out = await nkitConvert('ConvertToISO.exe', sourcePath, '.iso', log);
      fs.renameSync(out, targetPath);
    } else {
      log('Copying game image (no trim)...');
      fs.copyFileSync(sourcePath, targetPath);
    }
  } else {
    if (isNkit) {
      log('Game is already NKit, copying...');
      fs.copyFileSync(sourcePath, targetPath);
    } else {
      log('Trimming game to NKit format...');
      const out = await nkitConvert('ConvertToNKit.exe', sourcePath, '.nkit.iso', log);
      fs.renameSync(out, targetPath);
    }
  }
}

/**
 * Full GameCube -> Wii U VC injection.
 *
 * options: {
 *   baseDir,          // decrypted Wii VC base (code/content/meta)
 *   gamePath,         // GC image: iso/gcm/ciso/gcz/nkit.iso
 *   disc2Path,        // optional second disc
 *   gameName,         // display name ("Line1|Line2" for two lines)
 *   shortName,        // optional
 *   images: { icon, tv, drc, logo },  // optional paths (png/jpg/bmp/tga)
 *   force43,          // use nintendont_force.dol (forced 4:3)
 *   dontTrim,         // skip NKit trimming
 *   outDir,           // where the result goes
 *   commonKey,        // Wii U common key (hex) for CNUSPACKER; '' => loadiine output only
 * }
 */
async function inject(options, { onProgress = () => {}, log = () => {} } = {}) {
  const o = options;
  const step = (pct, msg) => {
    onProgress(pct, msg);
    log(`== ${msg}`);
  };

  if (!fs.existsSync(path.join(o.baseDir, 'code', 'app.xml')))
    throw new Error(`Base folder is not a decrypted Wii U title (missing code/app.xml): ${o.baseDir}`);
  // nfs2iso2nfs patches the base's vWii firmware and encrypts with its key.
  for (const req of ['fw.img', 'htk.bin']) {
    if (!fs.existsSync(path.join(o.baseDir, 'code', req)))
      throw new Error(
        `Base is missing code/${req}. The base must be a decrypted Wii-on-Wii-U eShop title ` +
        `(e.g. Rhythm Heaven Fever from the Wii U eShop), not a Wii disc dump.`
      );
  }
  if (!fs.existsSync(o.gamePath)) throw new Error(`Game file not found: ${o.gamePath}`);

  fs.rmSync(paths.temp, { recursive: true, force: true });
  fs.mkdirSync(paths.temp, { recursive: true });

  // 1) Wii container skeleton from BASE.zip, with Nintendont as main.dol
  step(2, 'Extracting Wii container skeleton (BASE.zip)...');
  const tempBase = path.join(paths.temp, 'TempBase');
  new AdmZip(toolPath('BASE.zip')).extractAllTo(tempBase, true);
  // Some BASE.zip revisions nest everything in a single top folder — flatten.
  if (!fs.existsSync(path.join(tempBase, 'sys'))) {
    const entries = fs.readdirSync(tempBase);
    if (entries.length === 1 && fs.existsSync(path.join(tempBase, entries[0], 'sys'))) {
      const inner = path.join(tempBase, entries[0]);
      for (const e of fs.readdirSync(inner)) fs.renameSync(path.join(inner, e), path.join(tempBase, e));
      fs.rmdirSync(inner);
    }
  }
  if (!fs.existsSync(path.join(tempBase, 'sys'))) throw new Error('BASE.zip layout unexpected: no sys/ directory.');

  step(5, `Applying Nintendont${o.force43 ? ' (forced 4:3)' : ''} as main.dol...`);
  fs.copyFileSync(toolPath(o.force43 ? 'nintendont_force.dol' : 'nintendont.dol'), path.join(tempBase, 'sys', 'main.dol'));

  // 2) GameCube image(s) into the container's files/
  step(8, 'Preparing GameCube image...');
  fs.mkdirSync(path.join(tempBase, 'files'), { recursive: true });
  await prepareGameFile(o.gamePath, path.join(tempBase, 'files', 'game.iso'), { dontTrim: o.dontTrim, log });
  if (o.disc2Path && fs.existsSync(o.disc2Path)) {
    step(20, 'Preparing disc 2...');
    await prepareGameFile(o.disc2Path, path.join(tempBase, 'files', 'disc2.iso'), { dontTrim: o.dontTrim, log });
  }

  // 3) Working copy of the decrypted base
  step(25, 'Copying base title...');
  const work = path.join(paths.temp, 'baseRom');
  copyDir(o.baseDir, work);
  const contentDir = path.join(work, 'content');
  const codeDir = path.join(work, 'code');
  const metaDir = path.join(work, 'meta');
  for (const f of fs.readdirSync(contentDir)) {
    if (f.toLowerCase().endsWith('.nfs')) fs.rmSync(path.join(contentDir, f), { force: true });
  }

  // 4) Build the Wii ISO from the skeleton
  step(30, 'Building Wii image (wit copy)...');
  const gameIso = path.join(contentDir, 'game.iso');
  fs.rmSync(gameIso, { force: true });
  await run(toolPath('wit.exe'), ['copy', tempBase, '--DEST', gameIso, '-ovv', '--links', '--iso'], {
    cwd: paths.tools,
    log,
  });
  if (!fs.existsSync(gameIso) || fs.statSync(gameIso).size === 0) throw new Error('wit copy produced no game.iso');

  // 5) Extract ticket/TMD from the built image -> code/rvlt.*
  step(55, 'Extracting ticket and TMD...');
  const tikTmd = path.join(paths.temp, 'TIKTMD');
  await run(
    toolPath('wit.exe'),
    ['extract', gameIso, '--psel', 'data', '--files', '+tmd.bin', '--files', '+ticket.bin', '--DEST', tikTmd, '-vv1'],
    { cwd: paths.tools, log }
  );
  for (const f of fs.readdirSync(codeDir)) {
    if (f.startsWith('rvlt.')) fs.rmSync(path.join(codeDir, f), { force: true });
  }
  fs.copyFileSync(path.join(tikTmd, 'tmd.bin'), path.join(codeDir, 'rvlt.tmd'));
  fs.copyFileSync(path.join(tikTmd, 'ticket.bin'), path.join(codeDir, 'rvlt.tik'));

  // 6) meta.xml: GCN reserved flag = hex of the image's 4-char disc id
  step(60, 'Patching meta.xml / app.xml...');
  const fd = fs.openSync(gameIso, 'r');
  const idBytes = Buffer.alloc(4);
  fs.readSync(fd, idBytes, 0, 4, 0);
  fs.closeSync(fd);
  setReservedFlag2(path.join(metaDir, 'meta.xml'), idBytes.toString('hex').toUpperCase());

  const { titleId, prodCode } = editBaseXmls(
    path.join(metaDir, 'meta.xml'),
    path.join(codeDir, 'app.xml'),
    o.gameName,
    o.shortName
  );
  log(`Title ID: ${titleId}, product code: WUP-N-${prodCode}`);

  // 7) Menu images. User-supplied paths win; for any slot left empty, try to
  // auto-fetch community artwork; fall back to the base's own / bundled default.
  step(63, 'Preparing menu images...');
  const img = { ...(o.images || {}) };
  if (o.autoFetchImages !== false) {
    try {
      const { fetchGameImages } = require('./artwork');
      const artDir = path.join(paths.temp, 'art');
      const { found } = await fetchGameImages(o.gamePath, artDir, { log });
      if (!img.icon && found.iconTex) img.icon = found.iconTex;
      if (!img.tv && found.bootTvTex) img.tv = found.bootTvTex;
      if (!img.drc && found.bootDrcTex) img.drc = found.bootDrcTex;
      if (!img.logo && found.bootLogoTex) img.logo = found.bootLogoTex;
    } catch (e) {
      log(`Art auto-fetch skipped: ${e.message}`);
    }
  }
  step(65, 'Converting menu images...');
  await convertImage(img.icon || toolPath('iconTex.tga'), metaDir, 'iconTex', log);
  await convertImage(img.tv || toolPath('bootTvTex.png'), metaDir, 'bootTvTex', log);
  await convertImage(img.drc || img.tv || toolPath('bootTvTex.png'), metaDir, 'bootDrcTex', log);
  if (img.logo) await convertImage(img.logo, metaDir, 'bootLogoTex', log);

  // 8) Convert the ISO to the Wii U NFS format
  step(68, 'Converting to NFS (nfs2iso2nfs)...');
  await run(toolPath('nfs2iso2nfs.exe'), ['-enc', '-homebrew', '-passthrough', '-iso', 'game.iso'], {
    cwd: contentDir,
    log,
  });
  const nfsFiles = fs.readdirSync(contentDir).filter((f) => f.toLowerCase().endsWith('.nfs'));
  if (nfsFiles.length === 0) throw new Error('nfs2iso2nfs produced no .nfs files.');
  log(`NFS parts: ${nfsFiles.join(', ')}`);
  fs.rmSync(gameIso, { force: true });

  // 9) Pack to an installable title (or emit loadiine folder if no common key)
  const outName = sanitizeName(`${(o.gameName || 'GC Inject').split(/[,|]/)[0]} [${prodCode}]`);
  const outPath = path.join(o.outDir || paths.output, outName);
  fs.rmSync(outPath, { recursive: true, force: true });
  fs.mkdirSync(outPath, { recursive: true });

  if (o.commonKey) {
    step(85, 'Packing installable title (CNUSPACKER)...');
    await run(toolPath('CNUSPACKER.exe'), ['-in', work, '-out', outPath, '-encryptKeyWith', o.commonKey], {
      cwd: paths.tools,
      log,
    });
    if (!fs.readdirSync(outPath).length) throw new Error('CNUSPACKER produced no output.');
  } else {
    step(85, 'No common key set — emitting loadiine-format folder instead of installable package...');
    copyDir(work, outPath);
  }

  step(100, 'Done.');
  if (process.env.GCWU_KEEP_TEMP !== '1') fs.rmSync(paths.temp, { recursive: true, force: true });
  return { outPath, titleId, prodCode, packed: !!o.commonKey };
}

module.exports = { inject };
