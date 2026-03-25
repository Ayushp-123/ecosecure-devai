const axios = require('axios');
const { addLog } = require('../utils/logger');

// Read key at call-time so .env loaded after require() still works
const getKey   = () => process.env.GEMINI_API_KEY;
const getModel = () => process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/**
 * Send a prompt to Gemini and return the text response.
 * Retries once on transient 5xx / network errors.
 */
async function callGemini(prompt, systemInstruction = '') {
  const key = getKey();

  // ── Demo mode: no API key configured ──────────────────────────────────
  if (!key) {
    addLog('warning', '⚠️  GEMINI_API_KEY not set — returning demo analysis');
    return buildDemoResponse(prompt);
  }

  const model   = getModel();
  const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      addLog('info', `🤖 Calling Gemini API (attempt ${attempt})...`);
      const { data } = await axios.post(`${baseUrl}?key=${key}`, body, { timeout: 45000 });
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini returned empty content');
      addLog('info', '✅ Gemini API responded successfully');
      return text;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const msg    = err.response?.data?.error?.message || err.message;
      addLog('error', `Gemini API error (attempt ${attempt}): ${msg}`);
      // Only retry on 5xx or network errors, not on 4xx (bad key, quota, etc.)
      if (status && status < 500) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

/**
 * Parse JSON from Gemini response — strips markdown fences, handles edge cases.
 * Returns a guaranteed object (never throws).
 */
function parseJsonResponse(text) {
  if (!text || typeof text !== 'string') {
    addLog('warning', 'parseJsonResponse: received empty/non-string input');
    return buildFallbackAnalysis('Empty response from AI');
  }

  // Strip markdown code fences
  let clean = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Sometimes Gemini wraps with extra text before the JSON — find first {
  const firstBrace = clean.indexOf('{');
  const lastBrace  = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(clean);
    // Ensure required fields exist
    return {
      hasIssues:       parsed.hasIssues      ?? false,
      severity:        parsed.severity       || 'none',
      vulnerabilities: Array.isArray(parsed.vulnerabilities) ? parsed.vulnerabilities : [],
      fixedCode:       parsed.fixedCode      || '',
      fixDescription:  parsed.fixDescription || '',
      mrTitle:         parsed.mrTitle        || 'Security analysis complete',
      mrDescription:   parsed.mrDescription  || '',
    };
  } catch (err) {
    addLog('warning', `Could not parse Gemini JSON: ${err.message} — using fallback`);
    return buildFallbackAnalysis(text);
  }
}

/**
 * Demo response used when GEMINI_API_KEY is missing.
 * Simulates a realistic vulnerability finding so the UI flow works end-to-end.
 */
function buildDemoResponse(prompt) {
  const file = prompt.match(/File:\s*(\S+)/)?.[1] || 'demo-file.js';
  return JSON.stringify({
    hasIssues: true,
    severity: 'high',
    vulnerabilities: [
      {
        type: 'Demo: Hardcoded Secret',
        line: 'const password = "admin123"',
        description: '[DEMO MODE] No real Gemini key set. This is a simulated finding to show the full UI flow.',
        cwe: 'CWE-798',
      },
      {
        type: 'Demo: SQL Injection Risk',
        line: 'db.query("SELECT * FROM users WHERE id=" + id)',
        description: '[DEMO MODE] Unsanitized input used directly in query string.',
        cwe: 'CWE-89',
      },
    ],
    fixedCode: `// [DEMO FIX] Use parameterized queries and environment variables\nconst password = process.env.DB_PASSWORD;\ndb.query('SELECT * FROM users WHERE id = ?', [id]);`,
    fixDescription: '[DEMO] Set GEMINI_API_KEY in .env for real AI analysis.',
    mrTitle: `fix(demo): security improvements in ${file}`,
    mrDescription: '## Demo Mode\nSet `GEMINI_API_KEY` in your `.env` for real analysis.',
  });
}

/**
 * Fallback when JSON parse fails — extract what we can from raw text.
 */
function buildFallbackAnalysis(rawText) {
  return {
    hasIssues: false,
    severity: 'none',
    vulnerabilities: [],
    fixedCode: '',
    fixDescription: 'AI response could not be parsed as JSON.',
    mrTitle: 'Security analysis (parse error)',
    mrDescription: `Raw AI output:\n\n${String(rawText).slice(0, 500)}`,
  };
}

module.exports = { callGemini, parseJsonResponse };
