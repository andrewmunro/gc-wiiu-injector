const fs = require('fs');
const path = require('path');
const { readGameId, repoIdCandidates } = require('./gameid');

const IMAGES_BASE = 'https://raw.githubusercontent.com/UWUVCI-PRIME/UWUVCI-IMAGES/master/gcn/';
const EXTS = ['png', 'jpg', 'jpeg', 'tga'];
const TEXTURES = ['iconTex', 'bootTvTex', 'bootDrcTex', 'bootLogoTex'];

async function head(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return r.ok;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return dest;
}

/**
 * Try to auto-fetch menu artwork for a GameCube game from the community
 * UWUVCI-IMAGES repo (same source the original app uses). Downloads whatever
 * of iconTex/bootTvTex/bootDrcTex/bootLogoTex exists into destDir and returns
 * a map of texture -> local file path (only for the ones found).
 *
 * The repo reliably has iconTex + bootTvTex; drc/logo are usually absent and
 * the pipeline derives bootDrcTex from the TV image anyway.
 */
async function fetchGameImages(gamePath, destDir, { log = () => {} } = {}) {
  const id = readGameId(gamePath);
  if (!id) {
    log('Could not read a disc ID from this image; skipping art auto-fetch.');
    return { id: null, found: {} };
  }
  log(`Disc ID ${id} — searching community artwork...`);
  const candidates = repoIdCandidates(id);
  fs.mkdirSync(destDir, { recursive: true });

  const found = {};
  for (const tex of TEXTURES) {
    let got = false;
    for (const repoId of candidates) {
      for (const ext of EXTS) {
        const url = `${IMAGES_BASE}${repoId}/${tex}.${ext}`;
        if (await head(url)) {
          const dest = path.join(destDir, `${tex}.${ext}`);
          await download(url, dest);
          found[tex] = dest;
          log(`  ${tex}: ${repoId}/${tex}.${ext}`);
          got = true;
          break;
        }
      }
      if (got) break;
    }
  }
  if (!Object.keys(found).length) log(`No community artwork found for ${id}.`);
  return { id, found };
}

module.exports = { fetchGameImages };
