const { callGemini, parseJsonResponse } = require('../services/geminiService');
const { getCommitDiff }                 = require('../services/gitlabService');
const { addLog }                        = require('../utils/logger');

const SYSTEM_PROMPT = `You are EcoSecure DevAI Code Reviewer.
Review code quality and provide actionable suggestions.
Always respond with valid JSON only.`;

async function runCodeReviewAgent(payload) {
  const projectId   = payload.project?.id;
  const projectName = payload.project?.name || 'unknown';
  const commits     = payload.commits || [];

  if (!projectId || commits.length === 0) {
    addLog('info', 'Code Review Agent: skipping (no projectId or commits)');
    return { skipped: true };
  }

  addLog('info', `📝 Code Review Agent triggered for ${projectName}`);

  let diffs;
  try {
    diffs = await getCommitDiff(projectId, commits[0].id);
  } catch (err) {
    addLog('error', `Code Review: failed to fetch diff: ${err.message}`);
    return { skipped: true, error: err.message };
  }

  const codeExtensions = /\.(js|ts|py|rb|go|java|php|cs)$/i;
  const relevantDiffs  = diffs.filter(d => !d.deleted_file && codeExtensions.test(d.new_path));

  if (relevantDiffs.length === 0) {
    addLog('info', 'Code Review Agent: no reviewable files in diff');
    return { skipped: true, reason: 'no code files' };
  }

  const reviews = [];
  for (const diff of relevantDiffs.slice(0, 3)) {
    const prompt = `
Review this code diff for quality issues:
File: ${diff.new_path}

DIFF:
${diff.diff}

Respond ONLY with JSON:
{
  "score": 0-10,
  "issues": [
    { "category": "performance|readability|maintainability|best-practice", "description": "...", "suggestion": "..." }
  ],
  "positives": ["what was done well"],
  "summary": "one-line summary"
}
`.trim();

    try {
      const raw    = await callGemini(prompt, SYSTEM_PROMPT);
      const review = parseJsonResponse(raw);
      addLog('info', `📋 Code review for ${diff.new_path}: score ${review.score ?? '?'}/10`, {
        file: diff.new_path, score: review.score, issues: review.issues,
      });
      reviews.push({ file: diff.new_path, ...review });
    } catch (err) {
      addLog('error', `Code review error for ${diff.new_path}: ${err.message}`);
    }
  }

  return { reviews, commit: commits[0].id, project: projectName };
}

module.exports = { runCodeReviewAgent };
