const fs = require('fs');
const { paths, ensureDirs } = require('./paths');

const defaults = {
  // Wii U common key (hex, 32 chars). Never shipped with the app; the user
  // must supply it. Required by CNUSPACKER for the installable output.
  commonKey: '',
  outDir: paths.output,
};

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(paths.settingsFile, 'utf8'));
    return { ...defaults, ...raw };
  } catch {
    return { ...defaults };
  }
}

function save(settings) {
  ensureDirs();
  const merged = { ...load(), ...settings };
  fs.writeFileSync(paths.settingsFile, JSON.stringify(merged, null, 2));
  return merged;
}

function validCommonKey(key) {
  return typeof key === 'string' && /^[0-9a-fA-F]{32}$/.test(key.trim());
}

module.exports = { load, save, validCommonKey };
