import { sanitizeAppearance, type Appearance } from '@the-world/shared';

const KEY = 'the-world:character';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null; // storage disabled (private mode, blocked cookies)
  }
}

/** The saved character, or null if there is none (or it can't be read). */
export function loadAppearance(store: KeyValueStore | null = defaultStore()): Appearance | null {
  try {
    const raw = store?.getItem(KEY);
    return raw ? sanitizeAppearance(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Saves the character; returns false if storage isn't available. */
export function saveAppearance(
  appearance: Appearance,
  store: KeyValueStore | null = defaultStore(),
): boolean {
  try {
    if (!store) return false;
    store.setItem(KEY, JSON.stringify(sanitizeAppearance(appearance)));
    return true;
  } catch {
    return false;
  }
}
