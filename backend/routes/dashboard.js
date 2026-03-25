const express = require('express');
const router = express.Router();
const { getLogs } = require('../utils/logger');
const { runDemoScan } = require('../agents/securityAgent');

// ─────────────────────────────────────────
// GET LOGS
// ─────────────────────────────────────────
router.get('/logs', (req, res) => {
  try {
    const logs = getLogs(100) || [];
    res.json({ logs });
  } catch (err) {
    console.error(err);
    res.json({ logs: [] });
  }
});

// ─────────────────────────────────────────
// GET VULNERABILITIES (FROM LOGS)
// ─────────────────────────────────────────
router.get('/vulnerabilities', (req, res) => {
  try {
    const logs = getLogs(200) || [];

    const vulnerabilities = logs
      .filter(l => l.type === 'warning')
      .map(l => ({
        message: l.message,
        meta: l.meta || {}
      }));

    res.json({ vulnerabilities });
  } catch (err) {
    console.error(err);
    res.json({ vulnerabilities: [] });
  }
});

// ─────────────────────────────────────────
// GET STATS
// ─────────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const logs = getLogs(200) || [];

    const total = logs.length;
    const warnings = logs.filter(l => l.type === 'warning').length;
    const errors = logs.filter(l => l.type === 'error').length;

    res.json({
      total,
      warnings,
      errors,
      status: 'active'
    });
  } catch (err) {
    console.error(err);
    res.json({
      total: 0,
      warnings: 0,
      errors: 0,
      status: 'error'
    });
  }
});

// ─────────────────────────────────────────
// FIX ALL (DEMO MODE)
// ─────────────────────────────────────────
router.post('/fix-all', async (req, res) => {
  try {
    console.log("🔥 DEMO MODE TRIGGERED");

    runDemoScan('manual').catch(err => {
      console.error(err);
    });

    res.json({ success: true, mode: 'demo' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;