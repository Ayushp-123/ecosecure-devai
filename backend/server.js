require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const webhookRoutes   = require('./routes/webhook');
const dashboardRoutes = require('./routes/dashboard');
const { addLog }      = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/webhook', webhookRoutes);
app.use('/api',     dashboardRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'EcoSecure DevAI',
    uptime:  process.uptime(),
    env: {
      hasGitlabToken: !!process.env.GITLAB_TOKEN,
      hasGeminiKey:   !!process.env.GEMINI_API_KEY,
    },
  });
});

// 404 handler — catches unknown routes cleanly
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  addLog('error', `Server error: ${err.message}`);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 EcoSecure DevAI Backend running on port ${PORT}`);
  console.log(`   Webhook:   POST http://localhost:${PORT}/webhook/gitlab`);
  console.log(`   Dashboard: GET  http://localhost:${PORT}/api/logs`);
  console.log(`   Health:    GET  http://localhost:${PORT}/health`);
  console.log(`\n   GitLab token : ${process.env.GITLAB_TOKEN  ? '✅ set' : '⚠️  NOT SET (demo mode only)'}`);
  console.log(`   Gemini key   : ${process.env.GEMINI_API_KEY ? '✅ set' : '⚠️  NOT SET (demo responses)'}\n`);
});

module.exports = app;

