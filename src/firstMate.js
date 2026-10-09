const os = require('node:os');
const { HerdrError } = require('./herdr');
const { cleanTerminalText, summarizeReply } = require('./textClean');

const FIRST_MATE_NAME = 'first-mate';
const TERMINAL_STATUSES = new Set(['idle', 'done', 'blocked']);

// Telegram is text-only: the user cannot answer interactive question dialogs
// or permission prompts. Every forwarded message carries this directive so
// first-mate never blocks on UI the Telegram side cannot operate.
const TELEGRAM_DIRECTIVE = '[Via Telegram relay: NEVER use interactive question dialogs, approval prompts, or AskUserQuestion-style UI. Use sensible defaults (previous convention in this repo) and state assumptions in text. Final reply must be plain text summary, no raw JSON.]';

/**
 * Ensure the persistent first-mate pane exists; create it if not.
 * @param {{runHerdr: Function, state?: {load?: Function, save?: Function}, agentKind?: string}} deps
 * @returns {Promise<{name: string, agent_status: string, pane_id: string, workspace_id: string}>}
 */
async function ensureFirstMate({ runHerdr, state, agentKind = 'opencode' }) {
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
    return `⚠️ First-mate đang chờ duyệt / xác nhận:\n\n${short}\n\n👉 Nhắn "ok" hoặc "allow" để Đồng ý, hoặc "reject" để Từ chối.`;
  }
  return short;
}

module.exports = { FIRST_MATE_NAME, ensureFirstMate, promptFirstMate };
