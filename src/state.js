const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_STATE_PATH = path.join(os.homedir(), '.shipmate-telegram', 'state.json');

function loadState(stateFilePath = DEFAULT_STATE_PATH) {
  if (!fs.existsSync(stateFilePath)) return {};
  try {
    const raw = fs.readFileSync(stateFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveState(pathOrState, maybeState) {
  let targetPath = DEFAULT_STATE_PATH;
  let state = {};
  if (typeof pathOrState === 'string') {
    targetPath = pathOrState;
    state = maybeState || {};
  } else if (pathOrState && typeof pathOrState === 'object') {
    state = pathOrState;
    if (typeof maybeState === 'string') targetPath = maybeState;
  }
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(state, null, 2), 'utf8');
}

module.exports = { DEFAULT_STATE_PATH, loadState, saveState };
