const { spawn } = require('child_process');

/**
 * Run an external tool, capturing stdout/stderr into the log callback.
 * Resolves with { code, output }. Set opts.ignoreExitCode for tools that
 * report unreliable exit codes (the NKit converters, png2tga) — callers
 * then validate by checking the expected output file exists.
 */
function run(exe, args, opts = {}) {
  const { cwd, log = () => {}, ignoreExitCode = false } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, windowsHide: true });
    let output = '';
    let lastLine = null;
    const onData = (d) => {
      const text = d.toString();
      output += text;
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.replace(/\r/g, '').trim();
        if (trimmed && trimmed !== lastLine) {
          lastLine = trimmed;
          log(trimmed);
        }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 && !ignoreExitCode) {
        reject(new Error(`${exe} exited with code ${code}\n${output.slice(-2000)}`));
      } else {
        resolve({ code, output });
      }
    });
  });
}

module.exports = { run };
