/**
 * Words that no text on the website may carry, and names that a person cannot take. No server code
 * here: the room talk screen uses the same list, and the chat service gets it for its own filter.
 * shortcut: a short list and whole words only, add a moderation service when real abuse shows a gap.
 */
export const BLOCKED_WORDS: readonly string[] = [
  "asshole", "bastard", "bitch", "cunt", "dick", "fuck", "fucker", "fucking", "motherfucker", "prick", "shit", "slut", "whore",
  "bhenchod", "bhosdike", "chutiya", "gandu", "harami", "kamina", "madarchod", "randi",
];

const BLOCKED = new Set(BLOCKED_WORDS);

/** Labels that the screens use for a person. A display name with one of them would mislead the room. */
const RESERVED_NAMES = new Set([
  "you", "your secret giver", "secret giver", "someone who left", "organizer", "guest", "solstice", "system", "admin", "demo",
]);

/** True when the text has a blocked word, in any letter case. Signs and digits inside a word do not hide it. */
export function hasBlockedWord(text: string): boolean {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]+/g, "")
    .split(/\s+/)
    .some((word) => BLOCKED.has(word));
}

/** True when the display name is a label of the website, in any letter case and spacing. */
export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.has(name.trim().toLowerCase().replace(/\s+/g, " "));
}
