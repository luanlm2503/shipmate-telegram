const os = require('node:os');
const { HerdrError } = require('./herdr');
const { cleanTerminalText } = require('./textClean');

const FIRST_MATE_NAME = 'first-mate';
const TERMINAL_STATUSES = new Set(['idle', 'done']);

/**
 * Ensure the persistent first-mate pane exists; create it if not.
 * @param {{runHerdr: Function, state: {load: Function, save: Function}, agentKind: string}} deps
 * @returns {Promise<{name: string, agent_status: string, pane_id: string, workspace_id: string}>}
 */
async function ensureFirstMate({ runHerdr, state, agentKind }) {
  try {
    const result = await runHerdr(['agent', 'get', FIRST_MATE_NAME]);
    return result.agent;
  } catch (err) {
    if (!(err instanceof HerdrError) || err.code !== 'agent_not_found') throw err;
  }

  const created = await runHerdr([
    'workspace', 'create',
    '--cwd', os.homedir(),
    '--label', FIRST_MATE_NAME,
    '--no-focus',
  ]);
  const workspaceId = created.workspace.workspace_id;
  const paneId = created.root_pane.pane_id;

  const started = await runHerdr([
    'agent', 'start', FIRST_MATE_NAME,
    '--kind', agentKind,
    '--pane', paneId,
    '--timeout', '30000',
  ]);

  state.save({ firstMateWorkspaceId: workspaceId, firstMatePaneId: paneId });
  return started.agent;
}

/**
 * Send a prompt to the first-mate pane and return its cleaned reply text.
 * Handles the agent_prompt_stalled/timeout detection-race pitfall: on either
 * error, checks the real status via `agent get` and proceeds if it is
 * already terminal (idle/done), rather than treating it as a failure.
 * @param {{runHerdr: Function, text: string, waitTimeoutMs?: number}} params
 * @returns {Promise<string>}
 */
async function promptFirstMate({ runHerdr, text, waitTimeoutMs = 1800000 }) {
  try {
    await runHerdr([
      'agent', 'prompt', FIRST_MATE_NAME, text,
      '--wait', '--until', 'idle', '--until', 'blocked',
      '--timeout', String(waitTimeoutMs),
    ]);
  } catch (err) {
    const isKnownRace = err instanceof HerdrError &&
      (err.code === 'agent_prompt_stalled' || err.code === 'timeout');
    if (!isKnownRace) throw err;

    const statusResult = await runHerdr(['agent', 'get', FIRST_MATE_NAME]);
    const status = statusResult.agent.agent_status;
    if (!TERMINAL_STATUSES.has(status)) {
      throw err; // genuinely still stuck — surface the original error
    }
    // else: fall through and read the reply as normal
  }

  const raw = await runHerdr(['agent', 'read', FIRST_MATE_NAME, '--source', 'recent', '--lines', '100', '--format', 'text']);
  return cleanTerminalText(raw);
}

module.exports = { FIRST_MATE_NAME, ensureFirstMate, promptFirstMate };
