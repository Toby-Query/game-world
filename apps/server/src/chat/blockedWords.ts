import { parseBlockedWords } from '@the-world/shared';
import blocked from '../../../../content/chat/blocked-words.json';

/** Words masked in chat; edit `content/chat/blocked-words.json`. */
export const BLOCKED_WORDS = parseBlockedWords(blocked);
