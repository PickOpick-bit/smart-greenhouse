/* ============================================================
   Smart Greenhouse — Frontend App Logic
   Update: Auto/Manual toggle + kontrol manual aktuator
   ============================================================ */

const API_BASE    = window.location.origin;
const WS_URL      = `ws://${window.location.host}`;
const MAX_HISTORY = 40;

let chartInstance = null;
let chartSensor   = 'suhu';
let historyData   = { labels: [], datasets: {} };
let ws            = null;
let wsRetryCount  = 0;
let _cfg          = {};
let _control      = { mode: 'auto', kipas: false, lampu: false, pompa: false };

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initChart();
  initTabs();
  initConfigForm();
  loadConfig();
  loadHistory();
  loadControl();
  connectWebSocket();
  updateEndpoints();
});

// ── Clock ────────────────────────────────────────────────────
function initClock() {
  function tick() {
    const now = new Date();
    document.getElementById('clockDisplay').textContent =
      now.toLocaleTimeString('id-ID', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

// ── WebSocket ────────────────────────────────────────────────
function connectWebSocket() {
  setConnStatus('offline', 'MENGHUBUNGKAN...');
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      wsRetryCount = 0;
      setConnStatus('online', 'TERHUBUNG · REALTIME');
      showToast('🌿 Terhubung ke greenhouse!');
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'sensor_update') {
          updateSensorUI(msg.data);
          appendToHistory(msg.data);
        }
        if (msg.type === 'control_update') {
          _control = msg.data;
          renderControlUI();
        }
      } catch (e) { /* ignore */ }
    };
    ws.onclose = () => {
      setConnStatus('warn', 'TERPUTUS · MENCOBA ULANG');
      const delay = Math.min(3000 * (wsRetryCount + 1), 15000);
      wsRetryCount++;
      setTimeout(connectWebSocket, delay);
    };
    ws.onerror = () => ws.close();
  } catch (e) {
    setConnStatus('warn', 'WS GAGAL · POLLING MODE');
    startPolling();
  }
}

function setConnStatus(state, label) {
  const dot = document.querySelector('.dot');
  const lbl = document.querySelector('.conn-label');
  if (dot) dot.className = 'dot dot--' + state;
  if (lbl) lbl.textContent = label;
}

function startPolling() {
  setInterval(async () => {
    try {
      const res  = await fetch(`${API_BASE}/data/latest`);
      const json = await res.json();
      if (json.success && json.data) updateSensorUI(json.data);
    } catch (e) { /* offline */ }
  }, 5000);

  setInterval(async () => {
    try {
      const res  = await fetch(`${API_BASE}/actuator`);
      const json = await res.json();
      if (json.success) { _control = json.data; renderControlUI(); }
    } catch (e) { /* offline */ }
  }, 5000);
}

// ── Sensor UI ────────────────────────────────────────────────
function updateSensorUI(d) {
  const data = {
    suhu:             d.suhu              ?? null,
    kelembapan_udara: d.kelembapan_udara  ?? null,
    kondisi_tanah:    d.kondisi_tanah     ?? '--',
    kondisi_cahaya:   d.kondisi_cahaya    ?? '--',
    status_kipas:     d.status_kipas      ?? 0,
    status_lampu:     d.status_lampu      ?? 0,
    status_pompa:     d.status_pompa      ?? 0,
    timestamp:        d.timestamp
  };

  setVal('valSuhu',       data.suhu,             1);
  setVal('valKelembapan', data.kelembapan_udara, 1);
  setTeks('valSoil',   data.kondisi_tanah,  { 'BASAH': '#4fc3f7', 'KERING': '#ffb347' });
  setTeks('valCahaya', data.kondisi_cahaya, { 'TERANG': '#ffeb3b', 'GELAP': '#546e7a' });

  setBar('barSuhu',       data.suhu,             45);
  setBar('barKelembapan', data.kelembapan_udara, 100);
  setBar('barSoil',   data.kondisi_tanah  === 'BASAH'  ? 100 : 20, 100);
  setBar('barCahaya', data.kondisi_cahaya === 'TERANG' ? 100 : 10, 100);

  loadConfigAndAlerts(data);

  // Update status badge aktuator (dari data sensor, bukan control)
  updateActuatorBadge('actKipas', 'statusKipas', 'badgeKipas', 'reasonKipas',
    data.status_kipas, data.status_kipas ? 'Aktif' : 'Standby');
  updateActuatorBadge('actLampu', 'statusLampu', 'badgeLampu', 'reasonLampu',
    data.status_lampu, data.status_lampu ? 'Aktif' : 'Standby');
  updateActuatorBadge('actPompa', 'statusPompa', 'badgePompa', 'reasonPompa',
    data.status_pompa, data.status_pompa ? 'Aktif' : 'Standby');

  const ts = data.timestamp ? new Date(data.timestamp) : new Date();
  const el = document.getElementById('lastUpdate');
  if (el) el.textContent = ts.toLocaleTimeString('id-ID') + ' · ' + ts.toLocaleDateString('id-ID');
}

function setVal(id, val, decimals = 1) {
  const el = document.getElementById(id);
  if (!el) return;
  const next = parseFloat(val);
  if (isNaN(next)) { if (!el.textContent || el.textContent === '0') el.textContent = '--'; return; }
  const prev = parseFloat(el.textContent);
  el.textContent = next.toFixed(decimals);
  if (!isNaN(prev) && prev !== next) {
    el.style.color = next > prev ? '#ff6b6b' : '#4fc3f7';
    setTimeout(() => (el.style.color = ''), 800);
  }
}

function setTeks(id, teks, warnaPeta = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent  = teks || '--';
  el.style.color  = warnaPeta[teks] || '';
  el.style.fontSize   = '1.4rem';
  el.style.fontWeight = 'bold';
}

function setBar(id, val, max) {
  const el = document.getElementById(id);
  if (!el) return;
  const pct = parseFloat(val);
  if (isNaN(pct)) return;
  el.style.width = Math.min(100, (pct / max) * 100).toFixed(1) + '%';
}

function updateActuatorBadge(cardId, statusId, badgeId, reasonId, isOn, reason) {
  const card   = document.getElementById(cardId);
  const status = document.getElementById(statusId);
  const badge  = document.getElementById(badgeId);
  const res    = document.getElementById(reasonId);
  if (!card) return;
  const on = isOn === 1 || isOn === true;
  card.classList.toggle('active', on);
  if (status) status.textContent = on ? 'ON' : 'OFF';
  if (badge)  badge.textContent  = on ? 'AKTIF' : 'STANDBY';
  if (res)    res.textContent    = reason;
}

// ── CONTROL AUTO/MANUAL ──────────────────────────────────────
async function loadControl() {
  try {
    const res  = await fetch(`${API_BASE}/actuator`);
    const json = await res.json();
    if (json.success) { _control = json.data; renderControlUI(); }
  } catch (e) { /* ignore */ }
}

function renderControlUI() {
  const isManual = _control.mode === 'manual';

  // Toggle button
  const toggleBtn = document.getElementById('modeToggle');
  if (toggleBtn) {
    toggleBtn.textContent = isManual ? '⚙ MODE: MANUAL' : '🤖 MODE: OTOMATIS';
    toggleBtn.className   = 'mode-toggle ' + (isManual ? 'manual' : 'auto');
  }

  // Tampilkan/sembunyikan panel manual
  const manualPanel = document.getElementById('manualPanel');
  if (manualPanel) manualPanel.style.display = isManual ? 'grid' : 'none';

  // Update tombol ON/OFF
  ['kipas', 'lampu', 'pompa'].forEach(name => {
    const btn = document.getElementById(`btn${capitalize(name)}`);
    if (!btn) return;
    const isOn = _control[name];
    btn.textContent = isOn ? `🔴 ${name.toUpperCase()}: ON` : `⚪ ${name.toUpperCase()}: OFF`;
    btn.className   = 'actuator-btn ' + (isOn ? 'on' : 'off');
  });
}

async function toggleMode() {
  const newMode = _control.mode === 'auto' ? 'manual' : 'auto';
  try {
    const res  = await fetch(`${API_BASE}/actuator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode })
    });
    const json = await res.json();
    if (json.success) {
      _control = json.data;
      renderControlUI();
      showToast(`Mode diubah ke: ${newMode.toUpperCase()}`);
    }
  } catch (e) { showToast('Gagal ubah mode', 'err'); }
}

async function toggleActuator(name) {
  if (_control.mode !== 'manual') {
    showToast('⚠ Pindah ke MODE MANUAL dulu!', 'warn');
    return;
  }
  const newVal = !_control[name];
  try {
    const res  = await fetch(`${API_BASE}/actuator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [name]: newVal })
    });
    const json = await res.json();
    if (json.success) {
      _control = json.data;
      renderControlUI();
      showToast(`${name.toUpperCase()} → ${newVal ? 'ON' : 'OFF'}`);
    }
  } catch (e) { showToast('Gagal kontrol aktuator', 'err'); }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Config & Alerts ──────────────────────────────────────────
async function loadConfig() {
  try {
    const res  = await fetch(`${API_BASE}/config`);
    const json = await res.json();
    if (!json.success) return;
    _cfg = json.data;
    populateConfigForm(_cfg);
    updateCurrentConfigDisplay(_cfg);
  } catch (e) { showToast('⚠ Gagal load konfigurasi', 'err'); }
}

function populateConfigForm(cfg) {
  ['suhuMax','soilMin','cahayaMin','kelembapanMin','kelembapanMax'].forEach(k => {
    const el = document.getElementById(k);
    if (el && cfg[k] !== undefined) el.value = cfg[k];
  });
}

function updateCurrentConfigDisplay(cfg) {
  ['suhuMax','soilMin','cahayaMin','kelembapanMin','kelembapanMax'].forEach(k => {
    const el = document.getElementById('cc-' + k);
    if (el) el.textContent = cfg[k] !== undefined ? cfg[k] : '--';
  });
}

function loadConfigAndAlerts(d) {
  if (!_cfg || Object.keys(_cfg).length === 0) return;
  checkAlert('alertSuhu',       d.suhu > _cfg.suhuMax,           `⚠ SUHU MELEBIHI ${_cfg.suhuMax}°C`);
  checkAlert('alertKelembapan', d.kelembapan_udara > _cfg.kelembapanMax, `⚠ KELEMBAPAN TINGGI > ${_cfg.kelembapanMax}%`);
  checkAlert('alertSoil',       d.kondisi_tanah === 'KERING',    `⚠ TANAH KERING`);
  checkAlert('alertCahaya',     d.kondisi_cahaya === 'GELAP',    `⚠ CAHAYA KURANG`);
}

function checkAlert(elId, condition, msg) {
  const el   = document.getElementById(elId);
  const card = el?.closest('.sensor-card');
  if (!el) return;
  el.textContent = condition ? msg : '';
  card?.classList.toggle('alert-active', condition);
}

// ── Config Form ──────────────────────────────────────────────
function initConfigForm() {
  const form = document.getElementById('configForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveBtn');
    const fb  = document.getElementById('saveFeedback');
    if (btn) btn.classList.add('loading');
    if (fb)  fb.textContent = '';

    const payload = {};
    ['suhuMax','soilMin','cahayaMin','kelembapanMin','kelembapanMax'].forEach(k => {
      const val = parseFloat(document.getElementById(k)?.value);
      if (!isNaN(val)) payload[k] = val;
    });

    try {
      const res  = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        _cfg = json.data;
        updateCurrentConfigDisplay(_cfg);
        if (fb) { fb.textContent = '✓ KONFIGURASI DISIMPAN'; fb.className = 'save-feedback ok'; }
        showToast('✅ Konfigurasi berhasil diperbarui');
      } else {
        if (fb) { fb.textContent = '✗ ' + (json.message || 'Gagal'); fb.className = 'save-feedback err'; }
      }
    } catch (err) {
      if (fb) { fb.textContent = '✗ SERVER TIDAK TERJANGKAU'; fb.className = 'save-feedback err'; }
      showToast('❌ Gagal terhubung ke server', 'err');
    } finally {
      if (btn) btn.classList.remove('loading');
      setTimeout(() => { if (fb) fb.textContent = ''; }, 4000);
    }
  });
}

// ── Chart ────────────────────────────────────────────────────
const sensorColors = {
  suhu:             { border: '#ff4f5e', bg: 'rgba(255,79,94,0.08)' },
  kelembapan_udara: { border: '#4fc3f7', bg: 'rgba(79,195,247,0.08)' }
};

function initChart() {
  const canvas = document.getElementById('sensorChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  Chart.defaults.color       = '#5a7a82';
  Chart.defaults.borderColor = '#1e2a2f';
  Chart.defaults.font.family = "'Space Mono', monospace";
  Chart.defaults.font.size   = 10;

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      label: 'Suhu (°C)',
      data: [],
      borderColor: sensorColors.suhu.border,
      backgroundColor: sensorColors.suhu.bg,
      borderWidth: 1.5, pointRadius: 2, tension: 0.4, fill: true
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#111518', borderColor: '#1e2a2f', borderWidth: 1,
                   titleColor: '#c8d8dc', bodyColor: '#c8d8dc', padding: 10 }
      },
      scales: {
        x: { grid: { color: '#1e2a2f' }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: { grid: { color: '#1e2a2f' } }
      }
    }
  });
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chartSensor = btn.dataset.sensor;
      rebuildChart();
    });
  });
}

function appendToHistory(d) {
  const ts = d.timestamp
    ? new Date(d.timestamp).toLocaleTimeString('id-ID', { hour12: false })
    : new Date().toLocaleTimeString('id-ID', { hour12: false });
  const fields = ['suhu', 'kelembapan_udara'];
  if (!historyData.labels.length) fields.forEach(f => (historyData.datasets[f] = []));
  historyData.labels.push(ts);
  fields.forEach(f => historyData.datasets[f].push(d[f] ?? null));
  if (historyData.labels.length > MAX_HISTORY) {
    historyData.labels.shift();
    fields.forEach(f => historyData.datasets[f].shift());
  }
  rebuildChart();
}

function rebuildChart() {
  if (!chartInstance) return;
  const c = sensorColors[chartSensor] || sensorColors.suhu;
  const labelMap = { suhu: 'Suhu (°C)', kelembapan_udara: 'Kelembapan (%)' };
  chartInstance.data.labels = [...historyData.labels];
  chartInstance.data.datasets[0].data            = [...(historyData.datasets[chartSensor] || [])];
  chartInstance.data.datasets[0].borderColor     = c.border;
  chartInstance.data.datasets[0].backgroundColor = c.bg;
  chartInstance.data.datasets[0].label           = labelMap[chartSensor] || chartSensor;
  chartInstance.update('none');
}

async function loadHistory() {
  try {
    const res  = await fetch(`${API_BASE}/data?limit=40`);
    const json = await res.json();
    if (!json.success || !json.history?.length) return;
    historyData = { labels: [], datasets: { suhu: [], kelembapan_udara: [] } };
    for (const row of json.history) {
      const ts = row.timestamp
        ? new Date(row.timestamp).toLocaleTimeString('id-ID', { hour12: false }) : '??:??:??';
      historyData.labels.push(ts);
      historyData.datasets.suhu.push(row.suhu ?? null);
      historyData.datasets.kelembapan_udara.push(row.kelembapan_udara ?? null);
    }
    rebuildChart();
    if (json.latest) updateSensorUI(json.latest);
  } catch (e) { /* server may not be ready */ }
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'ok') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'err' ? 'err' : type === 'warn' ? 'warn' : '');
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── ESP Endpoints ─────────────────────────────────────────────
function updateEndpoints() {
  const host = window.location.host;
  const postEl = document.getElementById('postUrl');
  const getEl  = document.getElementById('getUrl');
  if (postEl) postEl.textContent = `http://${host}/data`;
  if (getEl)  getEl.textContent  = `http://${host}/config`;
}

function copyEndpoints() {
  const host = window.location.host;
  const text = `POST http://${host}/data\nGET  http://${host}/config`;
  navigator.clipboard.writeText(text)
    .then(() => showToast('📋 Endpoint disalin!'))
    .catch(() => showToast('Gagal menyalin', 'err'));
}
