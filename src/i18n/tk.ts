// Marks English text for translation where it's made but not shown (the
// server's messages, data built in code): scripts/i18n.ts collects it, and
// the game shows it with t(msg). Safe to import anywhere, server included.
export const tk = (text: string): string => text;
