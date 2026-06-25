require('dotenv').config();
// server.js — Smart Greenhouse Backend
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const configRoutes = require('./routes/config');
const dataRoutes = require('./routes/data');

const app = express();
const server = http.createServer(app);

// ─── WebSocket Server ───────────────────────────────────────────────
const wss = new WebSocket.Server({ server });
app.locals.wss = wss;

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  ws.send(JSON.stringify({ type: 'connected', message: 'Smart Greenhouse WebSocket Ready' }));
  ws.on('close', () => console.log('[WS] Client disconnected'));
});

// ─── Middleware ─────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// Fallback ke index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});


// Request logger
app.use((req, res, next) => {
  const now = new Date().toLocaleTimeString('id-ID');
  console.log(`[${now}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ─────────────────────────────────────────────────────────
app.use('/config', configRoutes);
app.use('/data', dataRoutes);

// Manual control endpoint
let manualOverride = { mode: 'auto', kipas: 0, lampu: 0, pompa: 0 };

app.post('/control', (req, res) => {
  const { device, state, mode } = req.body;
  const validDevices = ['kipas', 'lampu', 'pompa'];
  if (!validDevices.includes(device)) {
    return res.status(400).json({ success: false, message: 'Device tidak valid' });
  }
  manualOverride[device] = state ? 1 : 0;
  manualOverride.mode = mode || 'manual';

  // Broadcast to all WebSocket clients so ESP8266 / other tabs get update
  const payload = JSON.stringify({
    type: 'control',
    device,
    state: state ? 1 : 0,
    mode: manualOverride.mode,
    override: manualOverride
  });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });

  const now = new Date().toLocaleTimeString('id-ID');
  console.log(`[${now}] KONTROL MANUAL → ${device}: ${state ? 'ON' : 'OFF'}`);
  res.json({ success: true, device, state: state ? 1 : 0, mode: manualOverride.mode });
});

app.get('/control', (req, res) => {
  res.json({ success: true, data: manualOverride });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Smart Greenhouse API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.path} tidak ditemukan` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Start ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🌿 Smart Greenhouse API berjalan di http://localhost:${PORT}`);
  console.log(`📡 WebSocket aktif di ws://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}\n`);
});
