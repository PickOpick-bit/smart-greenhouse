const express = require('express');
const router  = express.Router();
const { getConfig, insertSensorData, getLatestSensorData, getSensorHistory } = require('../db/database');

function computeActuators(sensor, config) {
  // Kipas: ON jika suhu tinggi atau kelembapan udara tinggi
  const kipas = (sensor.suhu > config.suhuMax || sensor.kelembapan_udara > config.kelembapanMax) ? 1 : 0;

  // Pompa: ON jika tanah KERING
  const pompa = (sensor.kondisi_tanah === 'KERING') ? 1 : 0;

  // Lampu: ON jika cahaya GELAP
  const lampu = (sensor.kondisi_cahaya === 'GELAP') ? 1 : 0;

  return { status_kipas: kipas, status_lampu: lampu, status_pompa: pompa };
}

router.post('/', async (req, res) => {
  try {
    const { suhu, kelembapan_udara, kondisi_tanah, kondisi_cahaya } = req.body;

    if (suhu === undefined || kelembapan_udara === undefined ||
        kondisi_tanah === undefined || kondisi_cahaya === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Field wajib: suhu, kelembapan_udara, kondisi_tanah, kondisi_cahaya'
      });
    }

    // Validasi nilai string
    if (!['BASAH','KERING'].includes(kondisi_tanah)) {
      return res.status(400).json({ success: false, message: 'kondisi_tanah harus BASAH atau KERING' });
    }
    if (!['TERANG','GELAP'].includes(kondisi_cahaya)) {
      return res.status(400).json({ success: false, message: 'kondisi_cahaya harus TERANG atau GELAP' });
    }

    const cfgDoc = await getConfig();
    const { _id, _type, updatedAt, ...config } = cfgDoc;

    const sensor = {
      suhu:             parseFloat(suhu),
      kelembapan_udara: parseFloat(kelembapan_udara),
      kondisi_tanah,
      kondisi_cahaya
    };

    const actuators = computeActuators(sensor, config);
    const saved     = await insertSensorData({ ...sensor, ...actuators });

    // WebSocket broadcast
    if (req.app.locals.wss) {
      const payload = JSON.stringify({ type: 'sensor_update', data: saved });
      req.app.locals.wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
    }

    res.json({
      success: true,
      message: 'Data diterima',
      aktuator: {
        kipas: actuators.status_kipas ? 'ON' : 'OFF',
        pompa: actuators.status_pompa ? 'ON' : 'OFF',
        lampu: actuators.status_lampu ? 'ON' : 'OFF'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

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

router.get('/latest', async (req, res) => {
  try {
    const data = await getLatestSensorData();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
