/** Chat rules shared by client and server. */
export const CHAT = {
  maxLength: 200,
  /** Nearby messages reach players within this many metres. */
  proximityRadius: 25,
  /** At most `burst` messages, refilling one every `refillSeconds`. */
  burst: 5,
  refillSeconds: 2,
  /** Seconds a speech bubble stays above a character. */
  bubbleSeconds: 6,
  /** Messages kept in the on-screen log. */
  logSize: 50,
} as const;

export const CHANNELS = ['nearby', 'global'] as const;
export type Channel = (typeof CHANNELS)[number];

/** client → server */
export interface ChatSend {
  channel: Channel;
  text: string;
}

/** server → client */
export interface ChatMessage {
  id: string;
  /** Session id of the speaker. */
  from: string;
  name: string;
  channel: Channel;
  text: string;
  t: number;
}

/** Trims, collapses whitespace, removes control characters and caps the length; null if empty. */
export function sanitizeChatText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT.maxLength);
  return text.length > 0 ? text : null;
}

export function parseChatSend(value: unknown): ChatSend | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const channel = CHANNELS.find((c) => c === v.channel);
  const text = sanitizeChatText(v.text);
  return channel && text ? { channel, text } : null;
}

const LEET: Record<string, string> = {
  '4': 'a',
  '@': 'a',
  '3': 'e',
  '0': 'o',
  '1': 'i',
  '!': 'i',
  $: 's',
  '5': 's',
  '7': 't',
};

/** Lower-case, undo letter swaps and squash repeats: "Sh1iiit" → "shit". */
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .split('')
    .map((c) => LEET[c] ?? c)
    .join('')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1');
}

const SUFFIXES = ['', 's', 'es', 'ed', 'er', 'ers', 'ing', 'y', 'head', 'heads'];

/**
 * Replaces blocked words with asterisks of the same length. Whole words only (plus common
 * endings), so innocent words that merely contain one ("class", "Scunthorpe") are left alone.
 */
export function maskProfanity(text: string, blocked: readonly string[]): string {
  const roots = new Set(blocked.map(normalizeWord));
  return text.replace(/[\p{L}\p{N}@$!]+/gu, (word) => {
    const w = normalizeWord(word);
    const hit = [...roots].some((root) =>
      SUFFIXES.some((suffix) => w === normalizeWord(root + suffix)),
    );
    return hit ? '*'.repeat(word.length) : word;
  });
}

/** Token bucket: `burst` messages at once, then one per `refillSeconds`. */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly burst: number = CHAT.burst,
    private readonly refillSeconds: number = CHAT.refillSeconds,
    now = Date.now(),
  ) {
    this.tokens = burst;
    this.last = now;
  }

  /** Spends a token if one is available. */
  allow(now = Date.now()): boolean {
    this.tokens = Math.min(this.burst, this.tokens + (now - this.last) / 1000 / this.refillSeconds);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  /** Seconds until the next message would be allowed. */
  waitSeconds(): number {
    return Math.max(0, (1 - this.tokens) * this.refillSeconds);
  }
}

/** Reads `content/chat/blocked-words.json`. */
export function parseBlockedWords(value: unknown): string[] {
  const words = (value as { words?: unknown } | null)?.words;
  if (!Array.isArray(words) || !words.every((w) => typeof w === 'string' && w.length > 0)) {
    throw new Error('blocked-words.json: "words" must be a list of words');
  }
  return words as string[];
}
