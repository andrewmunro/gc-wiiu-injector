const fs = require('fs');
const path = require('path');

/**
 * Read the 6-char disc ID from a GameCube/Wii image.
 * - iso/gcm: disc header at file offset 0
 * - ciso:    ISO offset 0 lives in the first stored block, at file offset 0x8000
 * - wbfs:    disc data starts after the 0x200 header (UWUVCI reads the id at 0x200)
 * Returns uppercased 6-char id, or null if it can't be determined (e.g. gcz).
 */
function readGameId(gamePath) {
  const ext = path.extname(gamePath).toLowerCase();
  let offset;
  if (ext === '.iso' || ext === '.gcm') offset = 0x00;
  else if (ext === '.ciso') offset = 0x8000;
  else if (ext === '.wbfs') offset = 0x200;
  else return null; // gcz / unknown: skip

  let fd;
  try {
    fd = fs.openSync(gamePath, 'r');
    const buf = Buffer.alloc(6);
    fs.readSync(fd, buf, 0, 6, offset);
    const id = buf.toString('ascii');
    return /^[A-Za-z0-9]{6}$/.test(id) ? id.toUpperCase() : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Candidate repo IDs to try, mirroring UWUVCI's GenerateRepoIds: the exact id
 * first, then region-swapped variants (E/P/J) keeping the maker code, then the
 * "fake id" that swaps chars 1 and 2.
 */
function repoIdCandidates(id) {
  if (!id || id.length < 6) return id ? [id] : [];
  const maker = id.substring(4, 6);
  const head = id.substring(0, 3);
  const fake = id[0] + id[2] + id[1] + id[3] + maker;
  const fakeHead = fake.substring(0, 3);
  const out = [
    id,
    head + 'E' + maker,
    head + 'P' + maker,
    head + 'J' + maker,
    fake,
    fakeHead + 'E' + maker,
    fakeHead + 'P' + maker,
    fakeHead + 'J' + maker,
  ];
  return [...new Set(out)];
}

module.exports = { readGameId, repoIdCandidates };
