/**
 * Helpers for working with Steam persona names.
 */

/**
 * Values Steam substitutes when a real persona name is not available.
 *
 * `GetFriendPersonaName` returns the literal string `[unknown]` for any account whose
 * profile is private or who is not on the caller's friend list. Passing that through
 * to the UI would present a placeholder as though it were someone's name.
 *
 * Clan tags are deliberately absent from this list: they appear as a `[Tag]` prefix
 * on a real name, so bracketed values cannot be rejected wholesale.
 */
const PLACEHOLDER_NAMES: ReadonlySet<string> = new Set(['[unknown]', '[unknown person]']);

/**
 * Reports whether a value is a real, displayable persona name.
 *
 * @param name - The candidate name, possibly null or blank.
 * @returns True when the value is a name worth showing.
 */
export function isUsablePersonaName(name: string | null | undefined): boolean {
  if (name === null || name === undefined) {
    return false;
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return !PLACEHOLDER_NAMES.has(trimmed.toLowerCase());
}

/**
 * Normalises a persona name, discarding placeholders and blanks.
 *
 * @param name - The raw name from Steam.
 * @returns The trimmed name, or null when there is no usable name.
 */
export function usablePersonaName(name: string | null | undefined): string | null {
  if (!isUsablePersonaName(name)) {
    return null;
  }
  return (name as string).trim();
}