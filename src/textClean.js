// Box-drawing border characters Herdr's terminal renderer pads lines with.
// These are replaced with a space wherever they occur.
const BORDER_CHARS_PATTERN = /[┃╹▀]/g;
// The block character (█) marks where real content ends and right-aligned
// metadata (timestamps, token counts) begins; everything from the first
// occurrence onward is discarded.
const BLOCK_CHAR = '█';
const DUPLICATE_MARKER_PATTERN = /^\s*\.\.\.\s*\(\d+\s+duplicate lines?\)\s*$/;

// Lines that are terminal/agent chrome rather than the agent's actual reply:
// echoed shell commands, raw herdr JSON, LSP/MCP connection noise, agent
// header/footer decorations. summarizeReply drops these so Telegram
// notifications stay short.
const NOISE_LINE_PATTERNS = [
  /^\$/, // echoed shell command ($ herdr agent ...)
  /^\{"id":"cli/, // raw herdr JSON response
  /^PS\s+[A-Z]:\\/, // PowerShell prompt line
  /^LSPs?\b/, // LSP / LSPs are disabled
  /^MCP\b/, // MCP header
  /Connected$/, // - 9remote Connected
  /are disabled$/, // LSPs are disabled
  /model catalog/, // claude unknown-model warning
  /^Build\s*·/, // opencode build header
  /^[⏵✻✢❯]/, // agent footer chrome
  /^[─━═]{3,}$/, // separator rules
];

function cleanTerminalText(raw) {
  if (!raw) return '';
  const lines = raw.split('\n');
  const cleanedLines = [];
  for (const line of lines) {
    if (DUPLICATE_MARKER_PATTERN.test(line)) continue;
    const blockIndex = line.indexOf(BLOCK_CHAR);
    const withoutTrailingMetadata = blockIndex === -1 ? line : line.slice(0, blockIndex);
    const withoutChrome = withoutTrailingMetadata.replace(BORDER_CHARS_PATTERN, ' ');
    const trimmed = withoutChrome.trim();
    if (trimmed === '') {
      cleanedLines.push('');
      continue;
    }
    cleanedLines.push(trimmed);
  }
  // Collapse 2+ consecutive blank lines down to exactly one blank line,
  // and drop leading/trailing blank lines entirely.
  const collapsed = [];
  let previousBlank = false;
  for (const line of cleanedLines) {
    const isBlank = line === '';
    if (isBlank && previousBlank) continue;
    collapsed.push(line);
    previousBlank = isBlank;
  }
  while (collapsed.length > 0 && collapsed[0] === '') collapsed.shift();
  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === '') collapsed.pop();
  return collapsed.join('\n');
}

function isNoiseLine(line) {
  return NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Shorten a cleaned terminal reply for Telegram: drop noise lines
 * (echoed commands, raw JSON, LSP/MCP chrome) and keep only the most
 * recent `maxLines`. Older lines are replaced with a single marker.
 */
function summarizeReply(cleaned, maxLines = 30) {
  if (!cleaned) return '';
  const lines = String(cleaned)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !isNoiseLine(line));
  if (lines.length <= maxLines) return lines.join('\n');
  const kept = lines.slice(lines.length - maxLines);
  return `[...${lines.length - maxLines} dòng trước đã lược bỏ]\n${kept.join('\n')}`;
}

module.exports = { cleanTerminalText, summarizeReply };
