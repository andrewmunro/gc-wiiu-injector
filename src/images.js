const fs = require('fs');
const path = require('path');
const { toolPath } = require('./tools');
const { run } = require('./run');

const SPECS = {
  iconTex: { w: 128, h: 128, bpp: 32 },
  bootTvTex: { w: 1280, h: 720, bpp: 24 },
  bootDrcTex: { w: 854, h: 480, bpp: 24 },
  bootLogoTex: { w: 170, h: 42, bpp: 32 },
};

function converterFor(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.png') return toolPath('png2tga.exe');
  if (ext === '.jpg' || ext === '.jpeg') return toolPath('jpg2tga.exe');
  if (ext === '.bmp') return toolPath('bmp2tga.exe');
  return null;
}

/**
 * Convert (or copy, for .tga inputs) an image into `<outDir>/<texName>.tga`
 * with the dimensions/bit depth the Wii U menu requires. Mirrors UWUVCI's
 * CopyAndConvertImage which shells out to png2tga/jpg2tga/bmp2tga.
 */
async function convertImage(inputPath, outDir, texName, log = () => {}) {
  const spec = SPECS[texName];
  if (!spec) throw new Error(`Unknown texture name: ${texName}`);
  const target = path.join(outDir, `${texName}.tga`);

  if (inputPath.toLowerCase().endsWith('.tga')) {
    fs.copyFileSync(inputPath, target);
    return target;
  }

  const exe = converterFor(inputPath);
  if (!exe) throw new Error(`Unsupported image format: ${inputPath} (use png/jpg/bmp/tga)`);

  // png2tga names its output after the INPUT basename, so two textures built
  // from the same source (e.g. TV + GamePad both from bootTvTex.png) would
  // collide in a shared folder. Convert into a private temp dir, then move the
  // single produced .tga to the real target.
  const tmpDir = path.join(outDir, `.imgconv_${texName}_${process.pid}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    await run(
      exe,
      ['-i', inputPath, '-o', tmpDir, `--width=${spec.w}`, `--height=${spec.h}`, `--tga-bpp=${spec.bpp}`, '--tga-compression=none'],
      { cwd: path.dirname(exe), log, ignoreExitCode: true }
    );

    let produced = path.join(tmpDir, path.basename(inputPath, path.extname(inputPath)) + '.tga');
    if (!fs.existsSync(produced)) {
      // Fall back to whatever single .tga it emitted.
      const tgas = fs.readdirSync(tmpDir).filter((f) => f.toLowerCase().endsWith('.tga'));
      if (tgas.length !== 1) throw new Error(`Image conversion failed for ${inputPath} (${tgas.length} outputs).`);
      produced = path.join(tmpDir, tgas[0]);
    }
    fs.rmSync(target, { force: true });
    fs.renameSync(produced, target);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return target;
}

module.exports = { convertImage, SPECS };
