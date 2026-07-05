#!/usr/bin/env node
// Headless harness for testing the pipeline without launching Electron.
//   node src/cli.js tools
//   node src/cli.js download-base --tid <16 hex> --key <32 hex> --name "Rhythm Heaven Fever" --region USA
//   node src/cli.js decrypt-base --in <nus folder> --name "Rhythm Heaven Fever" --region USA
//   node src/cli.js inject --base <decrypted base dir> --game <gc image> --name "Game Name" [--force43] [--dont-trim] [--out <dir>]
const path = require('path');
const { paths, ensureDirs } = require('./paths');
const settings = require('./settings');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

async function main() {
  ensureDirs();
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const log = (l) => console.log(l);
  const onProgress = (frac, msg) => {
    const pct = typeof frac === 'number' && frac <= 1 ? Math.round(frac * 100) : Math.round(frac);
    process.stdout.write(`\r[${pct}%] ${msg || ''}          `);
    if (pct >= 100) process.stdout.write('\n');
  };

  if (cmd === 'tools') {
    const { ensureTools, missingTools } = require('./tools');
    const res = await ensureTools({ onProgress, log });
    console.log(`\nDownloaded ${res.downloaded} tools. Missing now: ${missingTools().join(', ') || 'none'}`);
  } else if (cmd === 'download-base') {
    const { downloadTitle } = require('./nus');
    const { decryptBase } = require('./cdecrypt');
    const name = args.name || args.tid;
    const region = args.region ? ` [${args.region}]` : '';
    const nusDir = path.join(paths.temp, 'nus', args.tid);
    await downloadTitle(args.tid, args.key, nusDir, { onProgress, log });
    const out = path.join(paths.bases, `${name}${region}`);
    await decryptBase(nusDir, out, args.ckey || settings.load().commonKey, log);
    console.log('Base ready at: ' + out);
  } else if (cmd === 'decrypt-base') {
    const { decryptBase } = require('./cdecrypt');
    const name = args.name || 'Custom Base';
    const region = args.region ? ` [${args.region}]` : '';
    const out = path.join(paths.bases, `${name}${region}`);
    await decryptBase(args.in, out, args.ckey || settings.load().commonKey, log);
    console.log('Base ready at: ' + out);
  } else if (cmd === 'inject') {
    const { inject } = require('./inject');
    const s = settings.load();
    const res = await inject(
      {
        baseDir: args.base,
        gamePath: args.game,
        disc2Path: args.disc2,
        gameName: args.name || path.basename(args.game, path.extname(args.game)),
        shortName: args.short,
        images: { icon: args.icon, tv: args.tv, drc: args.drc, logo: args.logo },
        force43: !!args.force43,
        dontTrim: !!args['dont-trim'],
        autoFetchImages: !args['no-art'],
        outDir: args.out || s.outDir,
        commonKey: args.ckey || s.commonKey,
      },
      { onProgress: (pct, msg) => onProgress(pct / 100, msg), log }
    );
    console.log(`\nOutput: ${res.outPath} (${res.packed ? 'installable, use WUP Installer GX2' : 'loadiine format — set common key to get an installable package'})`);
  } else if (cmd === 'batch') {
    const { batchInject } = require('./batch');
    const s = settings.load();
    if (!args.base) throw new Error('--base <decrypted base dir> is required.');
    if (!args.dir) throw new Error('--dir <folder of games/archives> is required.');
    const results = await batchInject(
      {
        dir: args.dir,
        baseDir: args.base,
        force43: !!args.force43,
        dontTrim: !!args['dont-trim'],
        autoFetchImages: !args['no-art'],
        outDir: args.out || s.outDir,
        commonKey: args.ckey || s.commonKey,
      },
      { onProgress: ({ index, total, pct, name }) => onProgress(pct / 100, `(${index + 1}/${total}) ${name}: ${pct}%`), log }
    );
    console.log('\n===== BATCH SUMMARY =====');
    for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.name}${r.ok ? '' : '  — ' + r.error}`);
    const ok = results.filter((r) => r.ok).length;
    console.log(`\n${ok}/${results.length} succeeded. Output in ${args.out || s.outDir}`);
  } else if (cmd === 'nincfg') {
    const { buildNincfg } = require('./nincfg');
    const buf = buildNincfg({ preset: args.preset || 'recommended', forceVideo: args['force-video'] || null });
    const out = args.out || path.join(paths.output, 'nincfg.bin');
    require('fs').writeFileSync(out, buf);
    console.log(`Wrote ${buf.length}-byte nincfg.bin (${args.preset || 'recommended'}) to: ${out}`);
    console.log('Copy this file to the ROOT of your SD card.');
  } else if (cmd === 'set-key') {
    if (!settings.validCommonKey(args._[1] || '')) throw new Error('Provide a 32-hex-character common key.');
    settings.save({ commonKey: args._[1].trim().toLowerCase() });
    console.log('Common key saved.');
  } else {
    console.log('Commands: tools | download-base | decrypt-base | inject | set-key <hex>');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('\nERROR: ' + e.message);
  process.exitCode = 1;
});
