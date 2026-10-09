const fs = require('node:fs');
const path = require('node:path');
const TelegramBot = require('node-telegram-bot-api');

const { runHerdr } = require('./herdr');
const { loadState, saveState, DEFAULT_STATE_PATH } = require('./state');
const { ensureFirstMate, promptFirstMate, FIRST_MATE_NAME } = require('./firstMate');
const { diffAgentStatuses } = require('./notifier');
const { parseCommand, formatStatusMessage, handleStopCommand } = require('./commands');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stdout.write(line);
  const logDir = path.join(__dirname, '..', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
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

  const bot = new TelegramBot(telegramBotToken, { polling: true });
  const state = { load: () => loadState(stateFilePath), save: (s) => saveState(stateFilePath, s) };

  let lastKnownStatuses = {};

  async function sendToUser(text) {
    const MAX_LEN = 4000;
    const truncated = text.length > MAX_LEN ? text.slice(0, MAX_LEN) + '\n\n[...truncated]' : text;
    await bot.sendMessage(authorizedChatId, truncated || '(no output)');
  }

  bot.on('message', async (msg) => {
    if (msg.chat.id !== authorizedChatId) return; // silently drop unauthorized senders
    const text = msg.text || '';
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
      // command.type === 'text': forward to first-mate
      const reply = await promptFirstMate({ runHerdr, text: command.text });
      await sendToUser(reply);
    } catch (err) {
      log(`error handling message: ${err && err.stack ? err.stack : err}`);
      await sendToUser(`Error: ${err && err.message ? err.message : String(err)}`);
    }
  });

  async function pollForNotifications() {
    try {
      const { agents } = await runHerdr(['agent', 'list']);
      const events = diffAgentStatuses(lastKnownStatuses, agents);
      for (const event of events) {
        const label = event.kind === 'blocked' ? 'needs your approval' : 'finished';
        await sendToUser(`🔔 ${event.name} (workspace ${event.workspaceId}) ${label}.`);
      }
      lastKnownStatuses = {};
      for (const agent of (agents || [])) lastKnownStatuses[agent.name] = agent.agent_status;
    } catch (err) {
      log(`error polling for notifications: ${err && err.stack ? err.stack : err}`);
    }
  }

  async function init() {
    log('starting shipmate-telegram bot');
    await ensureFirstMate({ runHerdr, state, agentKind: firstMateAgentKind });
    log(`first-mate pane ready (kind=${firstMateAgentKind})`);
    setInterval(pollForNotifications, notifyPollIntervalMs);
  }

  return { bot, init };
}

module.exports = { startBot, FIRST_MATE_NAME };
