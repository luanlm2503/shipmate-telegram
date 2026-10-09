const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_STATE_PATH = path.join(os.homedir(), '.shipmate-telegram', 'state.json');

function loadState(stateFilePath = DEFAULT_STATE_PATH) {
  if (!fs.existsSync(stateFilePath)) return {};
  try {
    const raw = fs.readFileSync(stateFilePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveState(stateFilePath = DEFAULT_STATE_PATH, state) {
  const dir = path.dirname(stateFilePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
}

module.exports = { DEFAULT_STATE_PATH, loadState, saveState };
