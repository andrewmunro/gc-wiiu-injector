const $ = (id) => document.getElementById(id);

const state = {
  sourcePath: null,
  sourceType: null,
  outDir: null,
  toolsOk: false,
  hasKey: false,
  lastOutPath: null,
};

const GC_FILTERS = [
  { name: 'GameCube games & archives', extensions: ['iso', 'gcm', 'ciso', 'gcz', '7z', 'zip', 'rar'] },
  { name: 'GameCube images', extensions: ['iso', 'gcm', 'ciso', 'gcz'] },
  { name: 'Archives', extensions: ['7z', 'zip', 'rar'] },
  { name: 'All files', extensions: ['*'] },
];

function setProgress(pct, msg) {
  $('bar').style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (msg) $('progressMsg').textContent = msg;
}

const batchCards = new Map();

function ensureCard(index, total, name) {
  let c = batchCards.get(index);
  if (c) return c;
  const container = $('batchCards');
  const card = document.createElement('div');
  card.className = 'game-card';
  card.innerHTML = `
    <div class="game-header">
      <span class="game-name">${escHtml(name)}</span>
      <span class="game-status">pending</span>
      <button class="game-log-btn">Show logs</button>
    </div>
    <div class="game-bar"><div class="game-bar-fill"></div></div>
    <pre class="game-log" hidden></pre>
  `;
  container.appendChild(card);
  const el = {
    card,
    status: card.querySelector('.game-status'),
    bar: card.querySelector('.game-bar-fill'),
    log: card.querySelector('.game-log'),
    logBtn: card.querySelector('.game-log-btn'),
  };
  el.logBtn.addEventListener('click', () => {
    const hidden = el.log.hidden;
    el.log.hidden = !hidden;
    el.logBtn.textContent = hidden ? 'Hide logs' : 'Show logs';
  });
  batchCards.set(index, el);
  return el;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function refreshInjectButton() {
  $('btnInject').disabled = !(state.toolsOk && state.sourcePath && $('baseSelect').value);
}

function renderBases(bases) {
  const sel = $('baseSelect');
  sel.innerHTML = '';
  if (!bases.length) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = 'No bases yet — download or import one below';
    sel.appendChild(o);
  }
  for (const b of bases) {
    const o = document.createElement('option');
    o.value = b.dir;
    o.textContent = b.name;
    sel.appendChild(o);
  }
  refreshInjectButton();
}

async function refreshStatus() {
  const st = await window.api.getStatus();
  state.toolsOk = st.missingTools.length === 0;
  $('toolsStatus').textContent = state.toolsOk
    ? 'All tools present ✓'
    : `${st.missingTools.length} tools missing`;
  $('toolsStatus').className = 'status ' + (state.toolsOk ? 'ok' : 'warn');
  $('btnTools').hidden = state.toolsOk;

  state.hasKey = !!st.settings.commonKey;
  $('keyStatus').textContent = state.hasKey ? 'key saved ✓' : 'no key — loadiine output only';
  $('keyStatus').className = 'status ' + (state.hasKey ? 'ok' : 'warn');

  renderBases(st.bases);
}

function setSourcePath(path, type) {
  state.sourcePath = path;
  state.sourceType = type;
  const el = $('sourcePath');
  if (path) {
    el.textContent = path;
    el.classList.add('set');
  } else {
    el.textContent = 'none selected';
    el.classList.remove('set');
  }
  refreshInjectButton();
}

window.api.onBatchProgress(({ index, total, pct, msg, name }) => {
  const c = ensureCard(index, total, name);
  c.bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  c.status.textContent = msg || `${pct}%`;
  if (pct >= 100) c.card.className = 'game-card ok';
});
window.api.onBatchLog(({ index, line }) => {
  const c = batchCards.get(index);
  if (!c) return;
  c.log.textContent += line + '\n';
  c.log.scrollTop = c.log.scrollHeight;
});
window.api.onToolsProgress(({ frac, name }) => setProgress(frac * 100, `Downloading ${name}…`));
window.api.onBaseProgress(({ frac, phase }) =>
  setProgress(frac * 100, phase === 'decrypt' ? 'Decrypting base…' : 'Downloading base…')
);

$('btnTools').addEventListener('click', async () => {
  $('btnTools').disabled = true;
  try {
    await window.api.downloadTools();
    setProgress(100, 'Tools ready');
  } catch (e) {
    alert('Tool download failed:\n' + e.message);
  } finally {
    $('btnTools').disabled = false;
    refreshStatus();
  }
});

$('btnSaveKey').addEventListener('click', async () => {
  try {
    await window.api.saveSettings({ commonKey: $('commonKey').value.trim() });
    $('commonKey').value = '';
    refreshStatus();
  } catch (e) {
    alert(e.message);
  }
});

$('btnBaseDownload').addEventListener('click', async () => {
  const btn = $('btnBaseDownload');
  btn.disabled = true;
  try {
    await window.api.downloadBase({
      tid: $('baseTid').value.trim(),
      key: $('baseKey').value.trim(),
      name: $('baseName').value.trim(),
      region: $('baseRegion').value.trim(),
    });
    setProgress(100, 'Base ready');
    refreshStatus();
  } catch (e) {
    alert('Base download failed:\n' + e.message);
  } finally {
    btn.disabled = false;
  }
});

$('btnBaseImport').addEventListener('click', async () => {
  const dir = await window.api.pickDir('Choose base folder');
  if (!dir) return;
  try {
    await window.api.importBase({ dir });
    refreshStatus();
  } catch (e) {
    alert('Import failed:\n' + e.message);
  }
});

$('baseSelect').addEventListener('change', refreshInjectButton);

$('btnSourceFile').addEventListener('click', async () => {
  const p = await window.api.pickFile('Choose GC image', GC_FILTERS);
  if (!p) return;
  setSourcePath(p, 'file');
});

$('btnSourceDir').addEventListener('click', async () => {
  const p = await window.api.pickDir('Choose folder of games');
  if (!p) return;
  setSourcePath(p, 'dir');
});

$('btnSourceClear').addEventListener('click', () => setSourcePath(null, null));

$('btnOutDir').addEventListener('click', async () => {
  const p = await window.api.pickDir('Choose output folder');
  if (!p) return;
  state.outDir = p;
  $('outDirPath').textContent = p;
  $('outDirPath').classList.add('set');
});

$('btnOutDirClear').addEventListener('click', () => {
  state.outDir = null;
  $('outDirPath').textContent = 'default';
  $('outDirPath').classList.remove('set');
});

$('btnInject').addEventListener('click', async () => {
  $('btnInject').disabled = true;
  $('resultRow').hidden = true;
  $('progressMsg').textContent = '';
  batchCards.forEach((c) => c.card.remove());
  batchCards.clear();

  const options = {
    baseDir: $('baseSelect').value,
    force43: $('optForce43').checked,
    autoFetchImages: $('optAutoArt').checked,
  };
  if (state.outDir) options.outDir = state.outDir;
  if (state.sourceType === 'file') options.gamePath = state.sourcePath;
  else options.dir = state.sourcePath;

  try {
    const r = await window.api.batch(options);
    if (r.canceled) return;
    const ok = r.results.filter((x) => x.ok).length;
    const firstOk = r.results.find((x) => x.ok);
    state.lastOutPath = firstOk?.outPath;
    for (const [i, c] of batchCards) {
      c.card.className = 'game-card ' + (r.results[i]?.ok ? 'ok' : 'fail');
      c.status.textContent = r.results[i]?.ok ? 'done' : (r.results[i]?.error || 'failed');
    }
    $('progressMsg').textContent = `Done: ${ok}/${r.results.length} succeeded`;
    $('resultMsg').textContent = state.hasKey
      ? `Finished — ${ok} of ${r.results.length} game(s) injected`
      : `Finished (loadiine format, set a common key for installable packages) — ${ok} of ${r.results.length}`;
    $('resultRow').hidden = false;
  } catch (e) {
    alert('Injection failed:\n' + e.message);
    setProgress(0, 'Failed');
  } finally {
    $('btnInject').disabled = false;
    refreshInjectButton();
  }
});

$('btnOpenOut').addEventListener('click', () => {
  window.api.openPath(state.lastOutPath);
});

$('btnNincfg').addEventListener('click', async () => {
  try {
    const r = await window.api.saveNincfg({ preset: 'recommended' });
    if (r.saved) {
      $('nincfgStatus').textContent = `saved to ${r.dest} ✓`;
      $('nincfgStatus').className = 'status ok';
    }
  } catch (e) {
    alert('Could not save nincfg.bin:\n' + e.message);
  }
});

refreshStatus();
