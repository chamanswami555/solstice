/**
 * Words that a mask message must not carry. A mask hides the writer, so the bar is higher there.
 * shortcut: a short list and whole words only, add a moderation service when real abuse shows a gap.
 */
const BLOCKED = new Set([
  "asshole", "bastard", "bitch", "cunt", "dick", "fuck", "fucker", "fucking", "motherfucker", "prick", "shit", "slut", "whore",
  "bhenchod", "bhosdike", "chutiya", "gandu", "harami", "kamina", "madarchod", "randi",
]);

/** True when the text has a blocked word, in any letter case and next to punctuation. */
export function hasBlockedWord(text: string): boolean {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((word) => BLOCKED.has(word));
}
