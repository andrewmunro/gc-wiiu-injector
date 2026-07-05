const fs = require('fs');

const HEADER_SIZE = 0x8000;
const MAP_ENTRIES = 0x7ff8;
const GC_DISC_SIZE = 1459978240; // standard mini-DVD image size
const GC_MAGIC = 0xc2339f3d; // at offset 0x1c of a GameCube ISO

/**
 * Decode a Dolphin-format CISO (block-sparse image) to a plain ISO.
 * Layout: "CISO" magic u32, block_size u32 LE, 0x7FF8-byte block map
 * (1 = block stored, 0 = zero block), then the stored blocks in order.
 * GameCube output is zero-padded to the standard 1.36 GiB disc size so
 * downstream tools that expect a full image are happy.
 */
function cisoToIso(srcPath, destPath, onProgress = () => {}) {
  const src = fs.openSync(srcPath, 'r');
  try {
    const header = Buffer.alloc(HEADER_SIZE);
    if (fs.readSync(src, header, 0, HEADER_SIZE, 0) !== HEADER_SIZE)
      throw new Error('CISO file too small.');
    if (header.toString('ascii', 0, 4) !== 'CISO') throw new Error('Not a CISO file.');
    const blockSize = header.readUInt32LE(4);
    if (blockSize < 0x400 || blockSize > 0x8000000) throw new Error(`Implausible CISO block size ${blockSize}.`);

    let lastUsed = -1;
    for (let i = 0; i < MAP_ENTRIES; i++) if (header[8 + i] === 1) lastUsed = i;
    if (lastUsed < 0) throw new Error('CISO block map is empty.');

    const dest = fs.openSync(destPath, 'w+');
    try {
      const zero = Buffer.alloc(blockSize);
      const buf = Buffer.alloc(blockSize);
      let srcOff = HEADER_SIZE;
      for (let i = 0; i <= lastUsed; i++) {
        if (header[8 + i] === 1) {
          const n = fs.readSync(src, buf, 0, blockSize, srcOff);
          srcOff += blockSize;
          // final stored block may be short if the writer truncated padding
          fs.writeSync(dest, n === blockSize ? buf : buf.subarray(0, n));
        } else {
          fs.writeSync(dest, zero);
        }
        onProgress((i + 1) / (lastUsed + 1));
      }

      // Pad GameCube images to full disc size.
      let size = fs.fstatSync(dest).size;
      const probe = Buffer.alloc(4);
      fs.readSync(dest, probe, 0, 4, 0x1c);
      if (probe.readUInt32BE(0) === GC_MAGIC && size < GC_DISC_SIZE) {
        const pad = Buffer.alloc(1024 * 1024);
        while (size < GC_DISC_SIZE) {
          const n = Math.min(pad.length, GC_DISC_SIZE - size);
          fs.writeSync(dest, pad.subarray(0, n));
          size += n;
        }
      }
    } finally {
      fs.closeSync(dest);
    }
  } finally {
    fs.closeSync(src);
  }
  return destPath;
}

module.exports = { cisoToIso };
