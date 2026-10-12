const os = require('node:os');
const { HerdrError } = require('./herdr');
const { cleanTerminalText, summarizeReply } = require('./textClean');

const FIRST_MATE_NAME = 'first-mate';
const TERMINAL_STATUSES = new Set(['idle', 'done', 'blocked']);

// Telegram is text-only: the user cannot answer interactive question dialogs
// or permission prompts. Every forwarded message carries this directive so
// first-mate defaults to the shipmate workflow and never blocks on UI the
// Telegram side cannot operate.
const TELEGRAM_DIRECTIVE = '[Via Telegram relay: default to the shipmate skill workflow (Herdr worktree + crew agents). NEVER use interactive question dialogs, approval prompts, or AskUserQuestion-style UI. Use sensible defaults (previous repo convention) and state assumptions in text. Start crewmates trust-all: claude with --dangerously-skip-permissions, opencode with --auto, codex with --dangerously-bypass-approvals-and-sandbox; each crew in its own git worktree. Final reply must be plain text summary, no raw JSON.]';

function savedPaneId(state) {
  try {
    return state && typeof state.load === 'function' ? state.load().firstMatePaneId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve how to address first-mate: by name when Herdr still has it,
 * otherwise by the saved pane id when that pane still hosts an agent
 * (Herdr clears a live agent's name when the process inside restarts).
 * @returns {Promise<{target: string, agent: object}>}
 */
async function resolveFirstMate({ runHerdr, state }) {
  try {
    const result = await runHerdr(['agent', 'get', FIRST_MATE_NAME]);
    return { target: FIRST_MATE_NAME, agent: result.agent };
  } catch (err) {
    if (!(err instanceof HerdrError) || err.code !== 'agent_not_found') throw err;
  }
  const paneId = savedPaneId(state);
  if (!paneId) {
    throw new HerdrError('agent_not_found', 'agent target first-mate not found');
  }
  const result = await runHerdr(['agent', 'get', paneId]);
  return { target: paneId, agent: result.agent };
}

/**
 * Ensure the persistent first-mate pane exists; create it if not.
 * @param {{runHerdr: Function, state?: {load?: Function, save?: Function}, agentKind?: string}} deps
 * @returns {Promise<{name: string, agent_status: string, pane_id: string, workspace_id: string}>}
 */
async function ensureFirstMate({ runHerdr, state, agentKind = 'opencode' }) {
  try {
    const resolved = await resolveFirstMate({ runHerdr, state });
    if (resolved.target === FIRST_MATE_NAME) return resolved.agent;
    // Name was cleared (process restarted inside the pane): re-attach it.
    const renamed = await runHerdr(['agent', 'rename', resolved.target, FIRST_MATE_NAME]);
    return renamed.agent;
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

  let started;
  try {
    started = await runHerdr([
      'agent', 'start', FIRST_MATE_NAME,
      '--kind', agentKind,
      '--pane', paneId,
      '--timeout', '30000',
    ]);
  } catch (startErr) {
    // If agent startup fails, close the created workspace so it is not orphaned.
    try {
      await runHerdr(['workspace', 'close', workspaceId]);
    } catch {
      // ignore secondary cleanup failure
    }
    throw startErr;
  }

  if (state && typeof state.save === 'function') {
    state.save({ firstMateWorkspaceId: workspaceId, firstMatePaneId: paneId });
  }
  return started.agent;
}

/**
 * Send a prompt to the first-mate pane and return its cleaned reply text.
 * Handles the agent_prompt_stalled/timeout detection-race pitfall: on either
 * error, checks the real status via `agent get` and proceeds if it is
 * already terminal (idle/done/blocked), rather than treating it as a failure.
 * @param {{runHerdr: Function, text: string, waitTimeoutMs?: number}} params
 * @returns {Promise<string>}
 */
async function promptFirstMate({ runHerdr, text, waitTimeoutMs = 600000, replyMaxLines = 30 }) {
  const forwarded = `${TELEGRAM_DIRECTIVE}\n\n${text}`;
  try {
    await runHerdr([
      'agent', 'prompt', FIRST_MATE_NAME, forwarded,
      '--wait', '--until', 'idle', '--until', 'done', '--until', 'blocked',
      '--timeout', String(waitTimeoutMs),
    ], { timeoutMs: waitTimeoutMs + 30000 });
  } catch (err) {
    const isKnownRace = err instanceof HerdrError &&
      (err.code === 'agent_prompt_stalled' || err.code === 'timeout');
    if (!isKnownRace) throw err;

    const statusResult = await runHerdr(['agent', 'get', FIRST_MATE_NAME]);
    const status = statusResult?.agent?.agent_status;
    if (!TERMINAL_STATUSES.has(status)) {
      throw err; // genuinely still stuck — surface the original error
    }
    // else: fall through and read the reply as normal
  }

  let status;
  try {
    const statusResult = await runHerdr(['agent', 'get', FIRST_MATE_NAME]);
    status = statusResult?.agent?.agent_status;
  } catch {
    // ignore
  }

  let raw = '';
  // When agent is blocked (in alternate screen dialog), recent history cannot be scrolled; use visible
  if (status === 'blocked') {
    try {
      raw = await runHerdr(
        ['agent', 'read', FIRST_MATE_NAME, '--source', 'visible', '--lines', '60', '--format', 'text'],
        { raw: true }
      );
    } catch {
      // fallback
    }
  } else {
    try {
      raw = await runHerdr(
        ['agent', 'read', FIRST_MATE_NAME, '--source', 'recent', '--lines', '100', '--format', 'text'],
        { raw: true }
      );
    } catch {
      // If reading recent fails (e.g. alternate-screen transition), fall back to --source visible
      try {
        raw = await runHerdr(
          ['agent', 'read', FIRST_MATE_NAME, '--source', 'visible', '--lines', '60', '--format', 'text'],
          { raw: true }
        );
      } catch {
        // ignore
      }
    }
  }

  const cleaned = cleanTerminalText(raw);
  const short = summarizeReply(cleaned, replyMaxLines);
  if (status === 'blocked') {
    return `⚠️ First-mate đang chờ duyệt / xác nhận:\n\n${short}\n\n👉 Nếu là menu chọn: nhắn số option (1, 2, 3...). Nếu là xác nhận: nhắn "ok" để Đồng ý, "reject" để Từ chối.`;
  }
  return short;
}

/**
 * Read-only view of what the first-mate pane is currently displaying.
 * Returns a status header plus the cleaned visible viewport. Never sends
 * a prompt and never creates the pane. Falls back to the saved pane id
 * when Herdr has cleared the live agent's name.
 * @param {{runHerdr: Function, state?: {load?: Function}}} params
 * @returns {Promise<string>}
 */
async function readFirstMateViewport({ runHerdr, state }) {
  let target = FIRST_MATE_NAME;
  let info;
  try {
    const resolved = await resolveFirstMate({ runHerdr, state });
    target = resolved.target;
    info = resolved.agent;
  } catch (err) {
    if (err instanceof HerdrError && err.code === 'agent_not_found') {
      return 'first-mate is not currently running.';
    }
    throw err;
  }
  const header = `first-mate: ${info.agent_status} (workspace ${info.workspace_id})`;
  let raw = '';
  try {
    raw = await runHerdr(
      ['agent', 'read', target, '--source', 'visible', '--lines', '60', '--format', 'text'],
      { raw: true }
    );
  } catch {
    return `${header}\n\n(viewport could not be read)`;
  }
  const viewport = cleanTerminalText(raw);
  return `${header}\n\n${viewport || '(empty viewport)'}`;
}

module.exports = { FIRST_MATE_NAME, TELEGRAM_DIRECTIVE, ensureFirstMate, promptFirstMate, readFirstMateViewport };
