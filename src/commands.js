function parseCommand(messageText) {
  const trimmed = (messageText || '').trim();
  if (trimmed === '/status') return { type: 'status' };
  if (trimmed === '/stop' || trimmed.startsWith('/stop ')) {
    const rest = trimmed.slice('/stop'.length).trim();
    return { type: 'stop', name: rest.length > 0 ? rest : undefined };
  }
  return { type: 'text', text: messageText };
}

function formatStatusMessage(agents) {
  if (!Array.isArray(agents) || agents.length === 0) return 'No agents are currently running.';
  const lines = agents.map(
    (a) => `${a.name}: ${a.agent_status} (workspace ${a.workspace_id})`
  );
  return lines.join('\n');
}

async function handleStopCommand({ runHerdr, name, agents = [] }) {
  if (!name) {
    return { ok: false, message: 'Usage: /stop <name> — see /status for agent names.' };
  }
  const match = (agents || []).find((a) => a.name === name);
  if (!match) {
    return { ok: false, message: `Agent "${name}" not found. Check /status for current names.` };
  }
  await runHerdr(['worktree', 'remove', '--workspace', match.workspace_id, '--force']);
  return { ok: true, message: `Stopped and removed workspace for "${name}".` };
}

module.exports = { parseCommand, formatStatusMessage, handleStopCommand };
