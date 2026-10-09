const fs = require('node:fs');
const path = require('node:path');
const TelegramBot = require('node-telegram-bot-api');

const { runHerdr } = require('./herdr');
const { loadState, saveState, DEFAULT_STATE_PATH } = require('./state');
const { ensureFirstMate, promptFirstMate, FIRST_MATE_NAME } = require('./firstMate');
const { diffAgentStatuses } = require('./notifier');
const { parseCommand, formatStatusMessage, handleStopCommand } = require('./commands');

const logDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logDir, { recursive: true });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stdout.write(line);
  fs.appendFileSync(path.join(logDir, 'bot.log'), line);
}

function startBot(config) {
  const {
    telegramBotToken,
    authorizedChatId,
    notifyPollIntervalMs,
    firstMateAgentKind,
    stateFilePath = DEFAULT_STATE_PATH,
  } = config;

  const bot = new TelegramBot(telegramBotToken, { polling: false });
  bot.on('polling_error', (err) => log(`Telegram polling error: ${err && err.message ? err.message : err}`));
  bot.on('error', (err) => log(`Telegram bot error: ${err && err.message ? err.message : err}`));

  const state = { load: () => loadState(stateFilePath), save: (s) => saveState(stateFilePath, s) };

  let lastKnownStatuses = {};
  let isPrompting = false;
  let isPolling = false;

  async function sendToUser(text) {
    try {
      const MAX_LEN = 4000;
      const truncated = text.length > MAX_LEN ? text.slice(0, MAX_LEN) + '\n\n[...truncated]' : text;
      log(`Sending reply: "${(truncated || '').slice(0, 80).replace(/\n/g, ' ')}..."`);
      await bot.sendMessage(authorizedChatId, truncated || '(no output)');
    } catch (err) {
      log(`failed to send Telegram message: ${err && err.message ? err.message : err}`);
    }
  }

  bot.on('message', async (msg) => {
    if (msg.chat.id !== authorizedChatId) return; // silently drop unauthorized senders
    if (!msg.text) {
      await sendToUser('Only text commands and prompts are currently supported.');
      return;
    }
    const text = msg.text.trim();
    log(`Incoming message: "${text.slice(0, 100)}"`);
    const command = parseCommand(text);
    try {
      if (command.type === 'status') {
        const { agents } = await runHerdr(['agent', 'list']);
        await sendToUser(formatStatusMessage(agents));
        return;
      }
      if (command.type === 'stop') {
        const { agents } = await runHerdr(['agent', 'list']);
        const result = await handleStopCommand({ runHerdr, name: command.name, agents });
        await sendToUser(result.message);
        return;
      }
      // If agent is currently blocked and user sends a quick approval or rejection:
      const lower = command.text.trim().toLowerCase();
      try {
        const checkStatus = await runHerdr(['agent', 'get', FIRST_MATE_NAME]);
        if (checkStatus?.agent?.agent_status === 'blocked') {
          if (['ok', 'allow', 'yes', 'y', 'dong y', 'đồng ý', 'enter'].includes(lower)) {
            await runHerdr(['agent', 'send-keys', FIRST_MATE_NAME, 'enter']);
            await sendToUser('✅ Đã gửi Đồng ý (Enter) cho first-mate.');
            return;
          }
          if (['reject', 'no', 'deny', 'từ chối', 'tu choi', 'esc'].includes(lower)) {
            await runHerdr(['agent', 'send-keys', FIRST_MATE_NAME, 'esc']);
            await sendToUser('❌ Đã gửi Từ chối (Esc) cho first-mate.');
            return;
          }
        }
      } catch {
        // ignore check failure
      }

      // command.type === 'text': forward to first-mate with concurrency protection
      if (isPrompting) {
        await sendToUser('⚠️ First-mate is currently busy with an in-flight prompt. Please wait for it to finish.');
        return;
      }
      isPrompting = true;
      try {
        // Auto-heal: Ensure first-mate pane exists (re-opens if user closed the space in Herdr)
        await ensureFirstMate({ runHerdr, state, agentKind: firstMateAgentKind });
        const reply = await promptFirstMate({ runHerdr, text: command.text });
        await sendToUser(reply);
      } finally {
        isPrompting = false;
      }
    } catch (err) {
      log(`error handling message: ${err && err.stack ? err.stack : err}`);
      await sendToUser(`Error: ${err && err.message ? err.message : String(err)}`);
    }
  });

  async function pollForNotifications() {
    if (isPolling) return;
    isPolling = true;
    try {
      const { agents } = await runHerdr(['agent', 'list']);
      const events = diffAgentStatuses(lastKnownStatuses, agents);
      for (const event of events) {
        const label = event.kind === 'blocked' ? 'needs your approval' : 'finished';
        await sendToUser(`🔔 ${event.name} (workspace ${event.workspaceId}) ${label}.`);
      }
      lastKnownStatuses = {};
      for (const agent of (agents || [])) {
        const key = agent.name || agent.pane_id;
        if (key) lastKnownStatuses[key] = agent.agent_status;
      }
    } catch (err) {
      log(`error polling for notifications: ${err && err.stack ? err.stack : err}`);
    } finally {
      isPolling = false;
    }
  }

  async function init() {
    log('starting shipmate-telegram bot');
    await ensureFirstMate({ runHerdr, state, agentKind: firstMateAgentKind });
    log(`first-mate pane ready (kind=${firstMateAgentKind})`);
    bot.startPolling();
    log('Telegram long-polling started');
    setInterval(pollForNotifications, notifyPollIntervalMs);
  }

  return { bot, init };
}

module.exports = { startBot, FIRST_MATE_NAME };
