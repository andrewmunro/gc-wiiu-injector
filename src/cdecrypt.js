const fs = require('fs');
const path = require('path');
const { toolPath } = require('./tools');
const { run } = require('./run');

function looksDecrypted(dir) {
  return (
    fs.existsSync(path.join(dir, 'code', 'app.xml')) &&
    fs.existsSync(path.join(dir, 'meta', 'meta.xml')) &&
    fs.existsSync(path.join(dir, 'content'))
  );
}

/**
 * Decrypt a NUS-format title folder (title.tmd/title.tik/*.app) into
 * loadiine code/content/meta layout using CDecrypt.
 *
 * The UWUVCI-Tools CDecrypt build (v2.1, crediar modified v2) takes the Wii U
 * common key as its first argument:
 *   CDecrypt.exe <CommonKey> <input> [<output>]
 */
async function decryptBase(inputDir, outputDir, commonKey, log = () => {}) {
  const exe = toolPath('CDecrypt.exe');
  const key = (commonKey || '').trim();
  if (!/^[0-9a-fA-F]{32}$/.test(key))
    throw new Error('A valid 32-hex-character Wii U common key is required to decrypt a base (set it in Settings).');
  if (!fs.existsSync(path.join(inputDir, 'title.tmd')))
    throw new Error(`No title.tmd in ${inputDir} — this is not a NUS-format title folder.`);
  if (!fs.existsSync(path.join(inputDir, 'title.tik')))
    throw new Error(`No title.tik in ${inputDir}.`);

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  log(`Running CDecrypt <CommonKey> "${inputDir}" "${outputDir}"`);
  let lastOutput = '';
  try {
    const { output } = await run(exe, [key, inputDir, outputDir], {
      cwd: path.dirname(exe),
      log,
      ignoreExitCode: true,
    });
    lastOutput = output;
  } catch (e) {
    lastOutput = String(e.message);
  }
  if (looksDecrypted(outputDir)) return outputDir;
  throw new Error('CDecrypt did not produce a valid code/content/meta layout.\nLast output:\n' + lastOutput.slice(-2000));
}

module.exports = { decryptBase, looksDecrypted };
