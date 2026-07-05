const fs = require('fs');
const path = require('path');
const { fetchToFile, fetchBuffer } = require('./download');

const NUS_URL = 'http://ccs.cdn.wup.shop.nintendo.net/ccs/download/';

function parseTmd(tmd) {
  const contentCount = tmd.readUInt16BE(0x1de);
  const titleVersion = tmd.readUInt16BE(0x1dc);
  const titleId = tmd.subarray(0x18c, 0x194);
  const contents = [];
  for (let i = 0; i < contentCount; i++) {
    const off = 0xb04 + i * 0x30;
    contents.push({
      id: tmd.readUInt32BE(off),
      index: tmd.readUInt16BE(off + 4),
      type: tmd.readUInt16BE(off + 6),
      size: Number(tmd.readBigUInt64BE(off + 8)),
    });
  }
  return { contentCount, titleVersion, titleId, contents };
}

/**
 * Build a minimal Wii U ticket carrying the (common-key-encrypted) title key.
 * Signature fields are dummies — CDecrypt only reads the title key and title
 * id, and the final installable package gets a fresh ticket from CNUSPACKER.
 */
function buildTicket(titleIdHex, titleKeyHex, titleVersion) {
  const tik = Buffer.alloc(0x350);
  tik.writeUInt32BE(0x00010004, 0x000); // RSA-2048 / SHA-256 signature type
  tik.fill(0xff, 0x004, 0x104); // dummy signature
  tik.write('Root-CA00000003-XS0000000c', 0x140, 'ascii');
  tik[0x1bc] = 0x01; // ticket format version
  Buffer.from(titleKeyHex, 'hex').copy(tik, 0x1bf);
  Buffer.from(titleIdHex, 'hex').copy(tik, 0x1dc);
  tik.writeUInt16BE(titleVersion & 0xffff, 0x1e6);
  return tik;
}

/**
 * Download a title from the Nintendo Update Server into destDir
 * (title.tmd, title.tik, <contentid>.app [+ .h3]).
 */
async function downloadTitle(titleId, titleKeyHex, destDir, { onProgress = () => {}, log = () => {} } = {}) {
  const tid = titleId.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (tid.length !== 16) throw new Error('Title ID must be 16 hex characters.');
  const tkey = (titleKeyHex || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (tkey.length !== 32) throw new Error('Title key must be 32 hex characters.');

  fs.mkdirSync(destDir, { recursive: true });
  const base = NUS_URL + tid + '/';

  log('Downloading TMD...');
  const tmd = await fetchBuffer(base + 'tmd');
  fs.writeFileSync(path.join(destDir, 'title.tmd'), tmd);

  const { contents, titleVersion } = parseTmd(tmd);
  const totalBytes = contents.reduce((a, c) => a + c.size, 0);
  log(`Title v${titleVersion}, ${contents.length} contents, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB total`);

  // Prefer a real ticket if the CDN serves one; otherwise build one from the key.
  let wroteTik = false;
  try {
    const cetk = await fetchBuffer(base + 'cetk');
    fs.writeFileSync(path.join(destDir, 'title.tik'), cetk.subarray(0, 0x350));
    wroteTik = true;
    log('Got ticket from CDN (cetk).');
  } catch {
    /* expected for eShop titles */
  }
  if (!wroteTik) {
    fs.writeFileSync(path.join(destDir, 'title.tik'), buildTicket(tid, tkey, titleVersion));
    log('Generated ticket from title key.');
  }

  let doneBytes = 0;
  for (const c of contents) {
    const idHex = c.id.toString(16).padStart(8, '0');
    log(`Downloading content ${idHex} (${(c.size / 1024 / 1024).toFixed(1)} MiB)...`);
    await fetchToFile(base + idHex, path.join(destDir, idHex + '.app'), (frac) => {
      onProgress((doneBytes + frac * c.size) / totalBytes);
    });
    if (c.type & 0x02) {
      await fetchToFile(base + idHex + '.h3', path.join(destDir, idHex + '.h3'));
    }
    doneBytes += c.size;
    onProgress(doneBytes / totalBytes);
  }
  log('Download complete.');
  return destDir;
}

module.exports = { downloadTitle, parseTmd, buildTicket };
