/**
 * Opaque cursor = base64 of `(sortValue, id)` per ARCHITECTURE §6.5. Cursor
 * pagination only — no offset, since the content library and session
 * history both grow unbounded.
 */
export interface CursorParts {
  sortValue: string;
  id: string;
}

export function encodeCursor(parts: CursorParts): string {
  return Buffer.from(JSON.stringify([parts.sortValue, parts.id]), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorParts | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);

    if (!Array.isArray(parsed) || parsed.length !== 2) {
      return null;
    }

    const [sortValue, id] = parsed as unknown[];

    if (typeof sortValue !== 'string' || typeof id !== 'string') {
      return null;
    }

    return { sortValue, id };
  } catch {
    return null;
  }
}
