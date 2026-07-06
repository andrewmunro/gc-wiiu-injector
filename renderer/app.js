const $ = (id) => document.getElementById(id);

const state = {
  game: null,
  disc2: null,
  images: { icon: null, tv: null, drc: null, logo: null },
  toolsOk: false,
  hasKey: false,
  lastOut: null,
};

const GC_FILTERS = [
  { name: 'GameCube images', extensions: ['iso', 'gcm', 'ciso', 'gcz'] },
  { name: 'All files', extensions: ['*'] },
];
const IMG_FILTERS = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'tga'] }];

const $log = $('log');
function logLine(line) {
  $log.textContent += line + '\n';
  $log.scrollTop = $log.scrollHeight;
}

function setProgress(pct, msg) {
  $('bar').style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (msg) $('progressMsg').textContent = msg;
}

// Batch per-game card management
const batchCards = new Map(); // index -> { el, bar, status, log, logBtn }

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
  $('btnInject').disabled = !(state.toolsOk && state.game && $('baseSelect').value);
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

function bindPick(btnId, labelId, filters, assign) {
  $(btnId).addEventListener('click', async () => {
    const p = await window.api.pickFile('Choose file', filters);
    if (!p) return;
    assign(p);
    const el = $(labelId);
    el.textContent = p.split(/[\\/]/).pop();
    el.classList.add('set');
    refreshInjectButton();
  });
}

window.api.onLog(logLine);
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
window.api.onInjectProgress(({ pct, msg }) => setProgress(pct, msg));

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

bindPick('btnGame', 'gamePath', GC_FILTERS, (p) => {
  state.game = p;
  if (!$('gameName').value) {
    let n = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/\.nkit$/i, '');
    n = n.replace(/\s*[([].*?[)\]]\s*/g, ' ').trim(); // strip region tags
    $('gameName').value = n;
  }
});
bindPick('btnDisc2', 'disc2Path', GC_FILTERS, (p) => (state.disc2 = p));
$('btnDisc2Clear').addEventListener('click', () => {
  state.disc2 = null;
  $('disc2Path').textContent = 'optional';
  $('disc2Path').classList.remove('set');
});
bindPick('btnIcon', 'iconPath', IMG_FILTERS, (p) => (state.images.icon = p));
bindPick('btnTv', 'tvPath', IMG_FILTERS, (p) => (state.images.tv = p));
bindPick('btnDrc', 'drcPath', IMG_FILTERS, (p) => (state.images.drc = p));
bindPick('btnLogo', 'logoPath', IMG_FILTERS, (p) => (state.images.logo = p));

$('baseSelect').addEventListener('change', refreshInjectButton);

$('btnInject').addEventListener('click', async () => {
  $('btnInject').disabled = true;
  $('resultRow').hidden = true;
  $('log').textContent = '';
  try {
    const res = await window.api.inject({
      baseDir: $('baseSelect').value,
      gamePath: state.game,
      disc2Path: state.disc2,
      gameName: $('gameName').value.trim() || 'GC Inject',
      images: state.images,
      force43: $('optForce43').checked,
      dontTrim: $('optDontTrim').checked,
      autoFetchImages: $('optAutoArt').checked,
    });
    state.lastOut = res.outPath;
    $('resultMsg').textContent = res.packed
      ? `Done — install with WUP Installer GX2: ${res.outPath}`
      : `Done (loadiine format, set a common key for an installable package): ${res.outPath}`;
    $('resultRow').hidden = false;
  } catch (e) {
    alert('Injection failed:\n' + e.message);
    setProgress(0, 'Failed');
  } finally {
    $('btnInject').disabled = false;
    refreshInjectButton();
  }
});

$('btnOpenOut').addEventListener('click', () => state.lastOut && window.api.openPath(state.lastOut));

$('btnBatch').addEventListener('click', async () => {
  if (!$('baseSelect').value) return alert('Select a base first.');
  $('btnBatch').disabled = true;
  $('btnInject').disabled = true;
  $('log').textContent = '';
  batchCards.forEach((c) => c.card.remove());
  batchCards.clear();
  try {
    const r = await window.api.batch({
      baseDir: $('baseSelect').value,
      force43: $('optForce43').checked,
      dontTrim: $('optDontTrim').checked,
      autoFetchImages: $('optAutoArt').checked,
    });
    if (r.canceled) return;
    const ok = r.results.filter((x) => x.ok).length;
    for (const [i, c] of batchCards) {
      c.card.className = 'game-card ' + (r.results[i]?.ok ? 'ok' : 'fail');
      c.status.textContent = r.results[i]?.ok ? 'done' : (r.results[i]?.error || 'failed');
    }
    $('progressMsg').textContent = `Batch done: ${ok}/${r.results.length}`;
  } catch (e) {
    alert('Batch failed:\n' + e.message);
  } finally {
    $('btnBatch').disabled = false;
    refreshInjectButton();
  }
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
