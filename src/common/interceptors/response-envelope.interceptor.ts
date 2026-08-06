export interface PageInfo {
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface CollectionResponse<T> {
  data: T[];
  pageInfo: PageInfo;
}

/**
 * Wraps a collection payload per ARCHITECTURE §6.5 — `data` is always an
 * array, never `null`, even when empty.
 */
export function toCollectionResponse<T>(data: T[], pageInfo: PageInfo): CollectionResponse<T> {
  return { data, pageInfo };
}
