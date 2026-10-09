const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadState, saveState } = require('./state');

function tempStatePath() {
  return path.join(os.tmpdir(), `shipmate-telegram-state-test-${process.pid}-${Date.now()}.json`);
}

test('loadState returns an empty object when the file does not exist', () => {
  const p = tempStatePath();
  assert.equal(fs.existsSync(p), false);
  const state = loadState(p);
  assert.deepEqual(state, {});
});

test('saveState then loadState round-trips the first-mate workspace/pane ids', () => {
  const p = tempStatePath();
  saveState(p, { firstMateWorkspaceId: 'wA', firstMatePaneId: 'wA:p1' });
  const loaded = loadState(p);
  assert.deepEqual(loaded, { firstMateWorkspaceId: 'wA', firstMatePaneId: 'wA:p1' });
  fs.unlinkSync(p);
});

test('loadState returns an empty object if the file contains invalid JSON', () => {
  const p = tempStatePath();
  fs.writeFileSync(p, 'not valid json', 'utf8');
  const state = loadState(p);
  assert.deepEqual(state, {});
  fs.unlinkSync(p);
});

test('loadState returns an empty object if the file contains JSON null or array', () => {
  const p = tempStatePath();
  fs.writeFileSync(p, 'null', 'utf8');
  assert.deepEqual(loadState(p), {});
  fs.writeFileSync(p, '[1, 2, 3]', 'utf8');
  assert.deepEqual(loadState(p), {});
  fs.unlinkSync(p);
});

test('saveState supports (state, path) or (path, state) flexibly', () => {
  const p = tempStatePath();
  saveState({ a: 1 }, p);
  assert.deepEqual(loadState(p), { a: 1 });
  saveState(p, { b: 2 });
  assert.deepEqual(loadState(p), { b: 2 });
  fs.unlinkSync(p);
});
