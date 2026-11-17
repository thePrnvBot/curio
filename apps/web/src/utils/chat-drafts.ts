/**
 * Composer draft persistence. Drafts are keyed by chat (or by "new" for an
 * unsaved conversation) and kept in localStorage so a reload, navigation or
 * accidental tab close never loses what the learner was writing.
 */

const COMPOSER_DRAFT_PREFIX = "curio:composer:";
/** A runaway paste should not be able to fill the storage quota. */
const MAX_DRAFT_LENGTH = 16_000;

export interface DraftStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

function browserStorage(): DraftStorage | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage;
  } catch {
    // Private mode or a blocked storage partition: drafts stay in memory.
    return null;
  }
}

export function composerDraftKey(key: string): string {
  return `${COMPOSER_DRAFT_PREFIX}${key}`;
}

export function readComposerDraft(
  key: string,
  storage: DraftStorage | null = browserStorage()
): string {
  if (storage === null) {
    return "";
  }
  try {
    const value = storage.getItem(composerDraftKey(key));
    return value === null ? "" : value.slice(0, MAX_DRAFT_LENGTH);
  } catch {
    return "";
  }
}

export function writeComposerDraft(
  key: string,
  draft: string,
  storage: DraftStorage | null = browserStorage()
): void {
  if (storage === null) {
    return;
  }
  try {
    if (draft.length === 0) {
      storage.removeItem(composerDraftKey(key));
      return;
    }
    storage.setItem(composerDraftKey(key), draft.slice(0, MAX_DRAFT_LENGTH));
  } catch {
    // Full or unavailable storage is never worth interrupting typing for.
  }
}
