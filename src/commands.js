const { FIRST_MATE_NAME } = require('./firstMate');

function parseCommand(messageText) {
  const trimmed = (messageText || '').trim();
  const match = trimmed.match(/^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s+(.*))?$/s);
  if (match) {
    const cmd = match[1].toLowerCase();
    const rest = (match[2] || '').trim();
    if (cmd === 'status') {
      return { type: 'status' };
    }
    if (cmd === 'stop') {
      return { type: 'stop', name: rest.length > 0 ? rest : undefined };
    }
    if (cmd === 'firstmate') {
      return { type: 'firstmate' };
    }
  }
  return { type: 'text', text: messageText };
}

function getAgentDisplayName(agent) {
  if (!agent) return 'unknown';
  if (agent.name) return agent.name;
  if (agent.terminal_title_stripped) return `${agent.terminal_title_stripped} (${agent.agent || 'agent'})`;
  if (agent.agent && agent.pane_id) return `${agent.agent} [${agent.pane_id}]`;
  return agent.pane_id || 'unnamed-agent';
}

function formatStatusMessage(agents) {
  if (!Array.isArray(agents) || agents.length === 0) return 'No agents are currently running.';
  const lines = agents.map(
    (a) => `${getAgentDisplayName(a)}: ${a.agent_status} (workspace ${a.workspace_id})`
  );
  return lines.join('\n');
}

const APPROVE_WORDS = new Set(['ok', 'allow', 'yes', 'y', 'dong y', 'đồng ý', 'enter']);
const REJECT_WORDS = new Set(['reject', 'no', 'deny', 'từ chối', 'tu choi', 'esc']);

/**
 * Map a Telegram reply received while first-mate is blocked to the
 * send-keys sequence that operates the agent's dialog. A bare option
 * number N selects the Nth item of a select menu (highlight starts on
 * option 1, so N-1 downs then enter); approve/reject words map to
 * enter/esc for plain confirmation dialogs. Returns null when the text
 * is not a dialog answer.
 * @param {string} messageText
 * @returns {{keys: string[], label: string} | null}
 */
function resolveBlockedKeys(messageText) {
  const lower = (messageText || '').trim().toLowerCase();
  if (lower === '') return null;
  // A standalone option number anywhere in the reply wins: it selects the
  // Nth item of a select menu (highlight starts on option 1).
  const tokens = lower.split(/\s+/);
  const numToken = tokens.find((t) => /^[1-9][0-9]?$/.test(t));
  if (numToken) {
    const n = Number(numToken);
    const downs = Array(Math.max(0, n - 1)).fill('down');
    const arrows = n === 1 ? '' : '↓'.repeat(n - 1);
    const label = n === 1 ? 'option 1 (Enter)' : `option ${n} (${arrows} + Enter)`;
    return { keys: [...downs, 'enter'], label };
  }
  // Approve/reject words: exact match or leading word + space (so "ok please"
  // approves but "oklahoma" does not). Multi-word entries checked longest first.
  const startsWithWord = (word) => lower === word || lower.startsWith(`${word} `);
  const approve = [...APPROVE_WORDS].sort((a, b) => b.length - a.length);
  if (approve.some(startsWithWord)) {
    return { keys: ['enter'], label: 'Đồng ý (Enter)' };
  }
  const reject = [...REJECT_WORDS].sort((a, b) => b.length - a.length);
  if (reject.some(startsWithWord)) {
    return { keys: ['esc'], label: 'Từ chối (Esc)' };
  }
  return null;
}

async function handleStopCommand({ runHerdr, name, agents = [] }) {
  if (!name) {
    return { ok: false, message: 'Usage: /stop <name> — see /status for agent names.' };
  }
  if (name === FIRST_MATE_NAME) {
    return { ok: false, message: 'Cannot stop first-mate. /stop is for crewmates only.' };
  }
  const match = (agents || []).find((a) => a.name === name || a.pane_id === name);
  if (!match) {
    return { ok: false, message: `Agent "${name}" not found. Check /status for current names.` };
  }
  if (!match.workspace_id) {
    return { ok: false, message: `Agent "${name}" has no associated workspace ID.` };
  }
  await runHerdr(['worktree', 'remove', '--workspace', match.workspace_id, '--force']);
  return { ok: true, message: `Stopped and removed workspace for "${name}".` };
}

module.exports = { parseCommand, formatStatusMessage, handleStopCommand, getAgentDisplayName, resolveBlockedKeys };
