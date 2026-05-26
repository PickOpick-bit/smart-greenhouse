// routes/data.js
const express = require('express');
const router  = express.Router();
const {
  getConfig, getControl,
  insertSensorData, getLatestSensorData, getSensorHistory
} = require('../db/database');

function computeActuators(sensor, config) {
  return {
    status_kipas: (sensor.suhu > config.suhuMax || sensor.kelembapan_udara > config.kelembapanMax) ? 1 : 0,
    status_lampu: (sensor.kondisi_cahaya === 'GELAP') ? 1 : 0,
    status_pompa: (sensor.kondisi_tanah  === 'KERING') ? 1 : 0,
  };
}

// POST /data — terima data dari ESP8266
router.post('/', async (req, res) => {
  try {
    const { suhu, kelembapan_udara, kondisi_tanah, kondisi_cahaya } = req.body;

    if (suhu === undefined || kelembapan_udara === undefined ||
        kondisi_tanah === undefined || kondisi_cahaya === undefined) {
      return res.status(400).json({ success: false, message: 'Field wajib: suhu, kelembapan_udara, kondisi_tanah, kondisi_cahaya' });
    }

    if (!['BASAH','KERING'].includes(kondisi_tanah))
      return res.status(400).json({ success: false, message: 'kondisi_tanah harus BASAH atau KERING' });
    if (!['TERANG','GELAP'].includes(kondisi_cahaya))
      return res.status(400).json({ success: false, message: 'kondisi_cahaya harus TERANG atau GELAP' });

    const cfgDoc  = await getConfig();
    const control = await getControl();
    const { _id, _type, updatedAt, ...config } = cfgDoc;

    const sensor = {
      suhu:             parseFloat(suhu),
      kelembapan_udara: parseFloat(kelembapan_udara),
      kondisi_tanah,
      kondisi_cahaya
    };

    // Tentukan status aktuator berdasarkan mode
    let actuators;
    if (control.mode === 'manual') {
      actuators = {
        status_kipas: control.kipas ? 1 : 0,
        status_lampu: control.lampu ? 1 : 0,
        status_pompa: control.pompa ? 1 : 0,
      };
    } else {
      actuators = computeActuators(sensor, config);
    }

    const saved = await insertSensorData({
      ...sensor, ...actuators,
      mode: control.mode
    });

    // WebSocket broadcast
    if (req.app.locals.wss) {
      const payload = JSON.stringify({ type: 'sensor_update', data: saved });
      req.app.locals.wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
    }

    res.json({
      success: true,
      message: 'Data diterima',
      mode: control.mode,
      aktuator: {
        kipas: actuators.status_kipas ? 'ON' : 'OFF',
        lampu: actuators.status_lampu ? 'ON' : 'OFF',
        pompa: actuators.status_pompa ? 'ON' : 'OFF',
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
    const data = await getLatestSensorData();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
