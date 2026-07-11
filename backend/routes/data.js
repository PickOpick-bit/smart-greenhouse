// routes/data.js — Full Manual, no threshold logic
const express = require('express');
const router  = express.Router();
const {
  getControl, updateEspHeartbeat, getEspStatus,
  insertSensorData, getLatestSensorData, getSensorHistory
} = require('../db/database');

// POST /data — terima data dari ESP8266
router.post('/', async (req, res) => {
  try {
    const { suhu, kelembapan_udara, kondisi_tanah, kondisi_cahaya } = req.body;

    if (suhu === undefined || kelembapan_udara === undefined ||
        kondisi_tanah === undefined || kondisi_cahaya === undefined) {
      return res.status(400).json({ success: false, message: 'Field wajib: suhu, kelembapan_udara, kondisi_tanah, kondisi_cahaya' });
    }

    // Update heartbeat ESP8266
    await updateEspHeartbeat();

    // Ambil status kontrol manual
    const control = await getControl();

    const sensor = {
      suhu:             parseFloat(suhu),
      kelembapan_udara: parseFloat(kelembapan_udara),
      kondisi_tanah,
      kondisi_cahaya,
      status_kipas: control.kipas ? 1 : 0,
      status_lampu: control.lampu ? 1 : 0,
      status_pompa: control.pompa ? 1 : 0,
    };

    const saved = await insertSensorData(sensor);

    // Ambil status ESP untuk broadcast
    const espStatus = await getEspStatus();

    // WebSocket broadcast ke dashboard
    if (req.app.locals.wss) {
      const payload = JSON.stringify({
        type: 'sensor_update',
        data: saved,
        esp: espStatus
      });
      req.app.locals.wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
    }

    res.json({
      success: true,
      message: 'Data diterima',
      aktuator: {
        kipas: control.kipas ? 'ON' : 'OFF',
        lampu: control.lampu ? 'ON' : 'OFF',
        pompa: control.pompa ? 'ON' : 'OFF',
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /data — ambil history
router.get('/', async (req, res) => {
  try {
    const limit   = parseInt(req.query.limit) || 50;
    const history = await getSensorHistory(limit);
    const latest  = history.length ? history[history.length - 1] : null;
    res.json({ success: true, latest, history, count: history.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /data/latest
router.get('/latest', async (req, res) => {
  try {
    const data      = await getLatestSensorData();
    const espStatus = await getEspStatus();
    res.json({ success: true, data, esp: espStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /data/esp-status — cek status ESP8266
router.get('/esp-status', async (req, res) => {
  try {
    const espStatus = await getEspStatus();
    res.json({ success: true, ...espStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
