const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

class HerdrError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HerdrError';
    this.code = code;
  }
}

function parseHerdrOutput(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new HerdrError('invalid_json', `herdr stdout was not valid JSON: ${stdout.slice(0, 200)}`);
  }
  if (parsed.error) {
    throw new HerdrError(parsed.error.code, parsed.error.message);
  }
  return parsed;
}

/**
 * Run a herdr CLI subcommand and return its parsed `result` object.
 * Throws HerdrError (with `.code`) on any error response or non-zero exit
 * that still produced a parseable error JSON body (herdr prints errors to
 * stdout, not stderr, and exits non-zero — execFile's rejection and our own
 * JSON parsing both need to be handled).
 *
 * @param {string[]} args - e.g. ['agent', 'get', 'first-mate']
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<any>} parsed.result
 */
async function runHerdr(args, options = {}) {
  const { timeoutMs } = options;
  try {
    const { stdout } = await execFileAsync('herdr', args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    return parseHerdrOutput(stdout).result;
  } catch (err) {
    // execFile rejects on non-zero exit; herdr still writes its error JSON
    // to stdout in that case, so recover and parse it the same way.
    if (err && typeof err.stdout === 'string' && err.stdout.trim().length > 0) {
      return parseHerdrOutput(err.stdout).result;
    }
    if (err instanceof HerdrError) throw err;
    throw new HerdrError('process_error', err && err.message ? err.message : String(err));
  }
}

module.exports = { HerdrError, parseHerdrOutput, runHerdr };
