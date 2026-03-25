'use strict';
/**
 * utils/logger.js
 * In-memory log store for EcoSecure DevAI.
 * Log shape expected by frontend:
 *   { id, type, message, meta: { mrUrl?, mrIid?, file? }, timestamp }
 */

const { v4: uuidv4 } = require('uuid');

const MAX_LOGS = 500; // cap memory usage

/** @type {Array<{id:string,type:string,message:string,meta:object,timestamp:string}>} */
const logs = [];

/** Counters exposed in /api/stats */
const counters = {
  total: 0,
  mrs: 0,
  warnings: 0,
  errors: 0,
};

/**
 * Add a log entry.
 * @param {'info'|'success'|'warning'|'error'} type
 * @param {string} message
 * @param {object} [meta]  – { mrUrl, mrIid, file, before, after, riskScore, ... }
 * @returns {object} the created log entry
 */
function addLog(type, message, meta = {}) {
  const entry = {
    id: Date.now(),
    type: type || 'info',
    message,
    meta,
    timestamp: new Date().toISOString()
  };

  logs.unshift(entry); // newest first

  if (logs.length > MAX_LOGS) {
    logs.splice(MAX_LOGS);
  }

  // update counters
  counters.total += 1;
  if (type === 'warning') counters.warnings += 1;
  if (type === 'error')   counters.errors += 1;
  if (meta && meta.mrUrl) counters.mrs += 1;

  // console log (for debugging)
  const icon = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' }[type] || '▸';
  console.log(
    `[${new Date().toISOString()}] ${icon} [${type.toUpperCase()}] ${message}`,
    meta.file ? `(${meta.file})` : ''
  );

  return entry;
}

/** Return the most recent N logs. */
function getLogs(limit = 100) {
  return logs.slice(0, Math.min(limit, logs.length));
}

/** Clear all logs and reset counters. */
function clearLogs() {
  logs.length = 0;
  counters.total    = 0;
  counters.mrs      = 0;
  counters.warnings = 0;
  counters.errors   = 0;
}

/** Get live counters for /api/stats */
function getCounters() {
  return { ...counters };
}

module.exports = { addLog, getLogs, clearLogs, getCounters };
