const CHUNK_CHAR_SIZE = 2000;
const CHUNK_OVERLAP_CHARS = 200;

/**
 * Fixed-size sliding-window chunker feeding `ContentChunk` (`CM-09`). Word
 * count is estimated as `text.length / 4` (rough token-per-char ratio) since
 * no tokenizer dependency is otherwise needed in this codebase.
 */
export function chunkText(text: string): { text: string; tokenCount: number }[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const chunks: { text: string; tokenCount: number }[] = [];
  let start = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + CHUNK_CHAR_SIZE, trimmed.length);
    const chunkText = trimmed.slice(start, end).trim();
    if (chunkText) {
      chunks.push({ text: chunkText, tokenCount: Math.ceil(chunkText.length / 4) });
    }
    if (end >= trimmed.length) {
      break;
    }
    start = end - CHUNK_OVERLAP_CHARS;
  }

  return chunks;
}
