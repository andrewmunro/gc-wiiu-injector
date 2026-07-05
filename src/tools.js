const fs = require('fs');
const path = require('path');
const { paths, ensureDirs } = require('./paths');
const { fetchToFile, fetchText, md5File } = require('./download');

// Same tool source the original UWUVCI-AIO uses.
const TOOLS_URL = 'https://github.com/Hotbrawl20/UWUVCI-Tools/raw/master/';

// Only what the GameCube pipeline needs.
const TOOL_NAMES = [
  'wit.exe',
  'cygwin1.dll',
  'cygz.dll',
  'cyggcc_s-1.dll',
  'cygcrypto-1.1.dll',
  'cygncursesw-10.dll',
  'nfs2iso2nfs.exe',
  'nintendont.dol',
  'nintendont_force.dol',
  'BASE.zip',
  'ConvertToNKit.exe',
  'ConvertToISO.exe',
  'NKit.dll',
  'NKit.dll.config',
  'SharpCompress.dll',
  'CDecrypt.exe',
  'CNUSPACKER.exe',
  'png2tga.exe',
  'jpg2tga.exe',
  'bmp2tga.exe',
  'FreeImage.dll',
  'iconTex.tga',
  'bootTvTex.png',
];

function toolPath(name) {
  return path.join(paths.tools, name);
}

function missingTools() {
  return TOOL_NAMES.filter((n) => !fs.existsSync(toolPath(n)));
}

async function ensureTools({ onProgress = () => {}, log = () => {} } = {}) {
  ensureDirs();
  const missing = missingTools();
  if (missing.length === 0) return { downloaded: 0 };

  let done = 0;
  for (const name of missing) {
    const dest = toolPath(name);
    log(`Downloading ${name}...`);
    await fetchToFile(TOOLS_URL + encodeURIComponent(name), dest, (frac) => {
      onProgress((done + frac) / missing.length, name);
    });

    // MD5 verification (best-effort: repo hosts <name>.md5 companions).
    try {
      const expected = (await fetchText(TOOLS_URL + encodeURIComponent(name) + '.md5'))
        .split(/\r?\n/)[0]
        .trim()
        .toLowerCase();
      const actual = (await md5File(dest)).toLowerCase();
      if (expected && expected.length === 32 && expected !== actual) {
        fs.unlinkSync(dest);
        throw new Error(`MD5 mismatch for ${name} (expected ${expected}, got ${actual})`);
      }
    } catch (e) {
      if (String(e.message).includes('MD5 mismatch')) throw e;
      log(`(no MD5 available for ${name}, skipping verification)`);
    }

    done++;
    onProgress(done / missing.length, name);
  }
  return { downloaded: done };
}

module.exports = { TOOL_NAMES, toolPath, missingTools, ensureTools };
