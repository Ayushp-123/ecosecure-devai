const express = require('express');
const router  = express.Router();
const { runSecurityAgent, runDemoScan } = require('../agents/securityAgent');
const { runCodeReviewAgent }            = require('../agents/codeReviewAgent');
const { addLog }                        = require('../utils/logger');

// Read secret at call-time so .env changes are picked up
const getSecret = () => process.env.GITLAB_WEBHOOK_SECRET;

function validateWebhookToken(req, res, next) {
  const secret = getSecret();
  if (!secret) return next(); // not configured — allow all
  const token = req.headers['x-gitlab-token'];
  if (token !== secret) {
    addLog('error', 'Invalid webhook token — request rejected');
    return res.status(401).json({ error: 'Unauthorized: invalid webhook token' });
  }
  next();
}

// ── POST /webhook/gitlab ─────────────────────────────────────────
router.post('/gitlab', validateWebhookToken, async (req, res) => {
  const event   = req.headers['x-gitlab-event'] || 'unknown';
  const payload = req.body;

  addLog('info', `📥 Webhook received: ${event}`, {
    project: payload.project?.name,
    ref:     payload.ref,
    commits: payload.commits?.length,
  });

  // Accept both GitLab header values for push events
  if (event !== 'Push Hook' && event !== 'push' && event !== 'Push Event') {
    addLog('info', `Ignoring non-push event: ${event}`);
    return res.json({ message: `Event '${event}' ignored (only Push Hook is processed).` });
  }

  // Respond immediately so GitLab doesn't time out (10s limit)
  res.json({ message: 'Webhook received. Security agent running async.' });

  // Run both agents in background
  (async () => {
    try {
      await runSecurityAgent(payload);
    } catch (err) {
      addLog('error', `Security Agent failed: ${err.message}`);
    }
    try {
      await runCodeReviewAgent(payload);
    } catch (err) {
      addLog('error', `Code Review Agent failed: ${err.message}`);
    }
  })();
});

// ── POST /webhook/test ───────────────────────────────────────────
// Triggers a demo scan without needing a real GitLab payload
router.post('/test', async (req, res) => {
  addLog('info', '🧪 Test trigger received — running demo scan');
  res.json({ message: 'Test trigger accepted. Running demo scan...' });
  runDemoScan('webhook-test').catch(err => {
    addLog('error', `Test scan error: ${err.message}`);
  });
});

module.exports = router;
