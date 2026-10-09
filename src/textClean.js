// Box-drawing border characters Herdr's terminal renderer pads lines with.
// These are replaced with a space wherever they occur.
const BORDER_CHARS_PATTERN = /[┃╹▀]/g;
// The block character (█) marks where real content ends and right-aligned
// metadata (timestamps, token counts) begins; everything from the first
// occurrence onward is discarded.
const BLOCK_CHAR = '█';
const DUPLICATE_MARKER_PATTERN = /^\s*\.\.\.\s*\(\d+\s+duplicate lines?\)\s*$/;

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

module.exports = { cleanTerminalText };
