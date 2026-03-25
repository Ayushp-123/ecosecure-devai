'use strict';
/**
 * services/gitlabService.js
 * All GitLab REST API interactions:
 *   – fetch commit diffs
 *   – get file content
 *   – create branch
 *   – commit fixed code
 *   – create Merge Request
 */

const axios = require('axios');
const { addLog } = require('../utils/logger');

const BASE = () => process.env.GITLAB_URL  || 'https://gitlab.com';
const TOKEN = () => process.env.GITLAB_TOKEN || '';

/** Shared axios instance with auth header */
function gl() {
  return axios.create({
    baseURL: `${BASE()}/api/v4`,
    headers: {
      'PRIVATE-TOKEN': TOKEN(),
      'Content-Type': 'application/json',
    },
    timeout: 20000,
  });
}

/**
 * Fetch the diff for a specific commit.
 * Returns array of { old_path, new_path, diff, new_file, deleted_file }
 */
async function getCommitDiff(projectId, commitSha) {
  try {
    const enc = encodeURIComponent(projectId);
    const { data } = await gl().get(`/projects/${enc}/repository/commits/${commitSha}/diff`);
    return data; // array of diff objects
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    addLog('error', `GitLab: failed to fetch diff for ${commitSha}: ${msg}`);
    throw new Error(`Could not fetch commit diff: ${msg}`);
  }
}

/**
 * Get the raw content of a file at a given ref.
 * Returns the decoded file content as a string.
 */
async function getFileContent(projectId, filePath, ref = 'main') {
  try {
    const enc = encodeURIComponent(projectId);
    const encPath = encodeURIComponent(filePath);
    const { data } = await gl().get(`/projects/${enc}/repository/files/${encPath}`, {
      params: { ref },
    });
    // GitLab returns base64-encoded content
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    addLog('warning', `GitLab: could not fetch file ${filePath}@${ref}: ${msg}`);
    return null; // non-fatal; the diff itself is enough
  }
}

/**
 * Create a new branch from a source ref.
 * Returns the created branch object.
 */
async function createBranch(projectId, branchName, sourceBranch) {
  try {
    const enc = encodeURIComponent(projectId);
    const { data } = await gl().post(`/projects/${enc}/repository/branches`, {
      branch: branchName,
      ref: sourceBranch,
    });
    addLog('info', `GitLab: branch created → ${branchName}`);
    return data;
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    // If branch already exists that's fine — re-use it
    if (msg.includes('already exists')) {
      addLog('info', `GitLab: branch ${branchName} already exists, continuing`);
      return { name: branchName };
    }
    addLog('error', `GitLab: failed to create branch ${branchName}: ${msg}`);
    throw new Error(`Could not create branch: ${msg}`);
  }
}

/**
 * Commit one or more file changes to a branch in a single commit.
 * @param {string} projectId
 * @param {string} branch       – target branch
 * @param {string} commitMessage
 * @param {Array<{action:'create'|'update'|'delete', file_path:string, content:string}>} actions
 */
async function commitFiles(projectId, branch, commitMessage, actions) {
  try {
    const enc = encodeURIComponent(projectId);
    const { data } = await gl().post(`/projects/${enc}/repository/commits`, {
      branch,
      commit_message: commitMessage,
      actions,
    });
    addLog('info', `GitLab: committed ${actions.length} file(s) to ${branch}`);
    return data;
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    addLog('error', `GitLab: commit failed on ${branch}: ${msg}`);
    throw new Error(`Could not commit files: ${msg}`);
  }
}

/**
 * Open a Merge Request.
 * Returns { iid, web_url, title }
 */
async function createMergeRequest(projectId, sourceBranch, targetBranch, title, description) {
  try {
    const enc = encodeURIComponent(projectId);
    const { data } = await gl().post(`/projects/${enc}/merge_requests`, {
      source_branch: sourceBranch,
      target_branch: targetBranch,
      title,
      description,
      remove_source_branch: false,
      labels: 'security,ai-fix,ecosecure',
    });
    addLog('success', `GitLab: MR !${data.iid} created → ${data.web_url}`, {
      mrUrl: data.web_url,
      mrIid: data.iid,
    });
    return { iid: data.iid, web_url: data.web_url, title: data.title };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    // If an identical MR already exists GitLab returns 422
    if (err.response?.status === 422) {
      addLog('warning', `GitLab: MR from ${sourceBranch} already exists, skipping`);
      return null;
    }
    addLog('error', `GitLab: failed to create MR from ${sourceBranch}: ${msg}`);
    throw new Error(`Could not create MR: ${msg}`);
  }
}

/**
 * High-level helper: create branch → commit fixed files → open MR.
 * Returns the MR object or null.
 */
async function applyFixAndOpenMR(projectId, commitSha, sourceBranch, fixedFiles) {
  const fixBranch = `ecosecure/fix-${commitSha.slice(0, 8)}-${Date.now()}`;

  await createBranch(projectId, fixBranch, sourceBranch);

  const actions = fixedFiles.map(f => ({
    action: 'update',
    file_path: f.filePath,
    content: f.fixedCode,
    encoding: 'text',
  }));

  const commitMsg = [
    '🛡️ [EcoSecure DevAI] Auto-fix security vulnerabilities',
    '',
    `Source commit: ${commitSha}`,
    '',
    'Files patched:',
    ...fixedFiles.map(f => `  • ${f.filePath} — ${f.vulnSummary}`),
    '',
    'Generated by EcoSecure DevAI · Powered by Gemini',
  ].join('\n');

  await commitFiles(projectId, fixBranch, commitMsg, actions);

  const mrTitle = `🛡️ [EcoSecure] Security fix for commit ${commitSha.slice(0, 8)}`;
  const mrDesc = buildMRDescription(fixedFiles, commitSha);

  return createMergeRequest(projectId, fixBranch, sourceBranch, mrTitle, mrDesc);
}

/** Build a rich MR description in markdown */
function buildMRDescription(fixedFiles, commitSha) {
  const lines = [
    '## 🛡️ EcoSecure DevAI — Automated Security Fix',
    '',
    `> Auto-generated by **EcoSecure DevAI** after analysing commit \`${commitSha}\`.`,
    '',
    '### 📋 What was fixed',
    '',
  ];

  for (const f of fixedFiles) {
    lines.push(`#### \`${f.filePath}\``);
    if (f.vulnerabilities?.length) {
      for (const v of f.vulnerabilities) {
        lines.push(`- **${v.type}** (${v.cwe || 'N/A'}) — ${v.description || ''} *(${v.severity || 'medium'})*`);
      }
    }
    lines.push('');
    if (f.originalCode && f.fixedCode) {
      lines.push('<details><summary>View diff</summary>', '');
      lines.push('**Before:**');
      lines.push('```', f.originalCode.slice(0, 1200), '```', '');
      lines.push('**After:**');
      lines.push('```', f.fixedCode.slice(0, 1200), '```', '');
      lines.push('</details>', '');
    }
  }

  lines.push('---', '_Please review before merging. AI-generated fixes may need adjustment._');
  return lines.join('\n');
}

module.exports = {
  getCommitDiff,
  getFileContent,
  createBranch,
  commitFiles,
  createMergeRequest,
  applyFixAndOpenMR,
};
