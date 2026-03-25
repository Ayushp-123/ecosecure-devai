const { addLog } = require('../utils/logger');

// ───────── DEMO SCAN ─────────
async function runDemoScan(name = 'demo') {
  addLog('info', `🤖 Demo scan started for ${name}`);

  const vulnerabilities = [
    {
      file: 'queries.js',
      issue: 'SQL Injection',
      severity: 'high',
      fix: 'Use parameterized queries'
    },
    {
      file: 'auth.js',
      issue: 'Hardcoded secret',
      severity: 'medium',
      fix: 'Move secret to environment variables'
    }
  ];

  vulnerabilities.forEach(v => {
    addLog('warning', `${v.issue} found in ${v.file}`, v);
  });

  addLog('success', '✅ Demo scan completed');

  return vulnerabilities;
}

// ───────── MAIN AGENT ─────────
async function runSecurityAgent(payload) {
  return runDemoScan('fallback');
}

module.exports = { runSecurityAgent, runDemoScan };