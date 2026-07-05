const os = require('os');
const path = require('path');
const fs = require('fs');

// Single fixed data root so the Electron app and the CLI harness share
// tools/bases/settings.
const dataRoot = path.join(os.homedir(), '.gc-wiiu-injector');

const paths = {
  dataRoot,
  tools: path.join(dataRoot, 'tools'),
  temp: path.join(dataRoot, 'temp'),
  bases: path.join(dataRoot, 'bases'),
  output: path.join(dataRoot, 'output'),
  settingsFile: path.join(dataRoot, 'settings.json'),
};

function ensureDirs() {
  for (const p of [paths.dataRoot, paths.tools, paths.temp, paths.bases, paths.output]) {
    fs.mkdirSync(p, { recursive: true });
  }
}

module.exports = { paths, ensureDirs };
