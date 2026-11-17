/** Command-palette grouping and filtering, kept pure so it is testable. */

export const PALETTE_GROUPS = ["Pages", "Actions", "Chats", "Courses"] as const;

export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

/**
 * Order groups by where the learner is: chats first inside a conversation,
 * courses first inside a course, everything else by importance.
 */
export function paletteGroupOrder(pathname: string): readonly PaletteGroup[] {
  if (pathname.startsWith("/chat")) {
    return ["Chats", "Pages", "Actions", "Courses"];
  }
  if (pathname.startsWith("/courses")) {
    return ["Courses", "Pages", "Actions", "Chats"];
  }
  return PALETTE_GROUPS;
}

export function matchesPaletteQuery(
  entry: { keywords?: string; label: string },
  query: string
): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return true;
  }
  return `${entry.label} ${entry.keywords ?? ""}`
    .toLowerCase()
    .includes(normalized);
}

export function filterPaletteEntries<
  T extends { keywords?: string; label: string },
>(entries: readonly T[], query: string): readonly T[] {
  return entries.filter((entry) => matchesPaletteQuery(entry, query));
}
