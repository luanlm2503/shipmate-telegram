require('dotenv').config();
const { startBot } = require('./src/bot');

const requiredEnv = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  authorizedChatId: Number(process.env.TELEGRAM_CHAT_ID),
  notifyPollIntervalMs: Number(process.env.NOTIFY_POLL_INTERVAL_MS || 5000),
  firstMateAgentKind: process.env.FIRST_MATE_AGENT_KIND || 'opencode',
};

const { init } = startBot(config);
init().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
