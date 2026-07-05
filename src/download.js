const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function fetchToFile(url, dest, onProgress) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const total = Number(res.headers.get('content-length')) || 0;
  const tmp = dest + '.part';
  const out = fs.createWriteStream(tmp);
  let received = 0;

  for await (const chunk of res.body) {
    received += chunk.length;
    if (!out.write(chunk)) {
      await new Promise((r) => out.once('drain', r));
    }
    if (onProgress && total) onProgress(received / total);
  }
  await new Promise((resolve, reject) => {
    out.end(() => resolve());
    out.on('error', reject);
  });
  fs.renameSync(tmp, dest);
  return dest;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function md5File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    fs.createReadStream(file)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

module.exports = { fetchToFile, fetchText, fetchBuffer, md5File };
