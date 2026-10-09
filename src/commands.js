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

module.exports = { parseCommand, formatStatusMessage, handleStopCommand, getAgentDisplayName };
