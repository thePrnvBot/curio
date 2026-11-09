/** What a save should do with the stored provider API key. */
export type ProviderKeyUpdate =
  | { readonly kind: "keep" }
  | { readonly kind: "clear" }
  | { readonly kind: "set"; readonly apiKey: string };

/**
 * The key field always renders blank because the saved key never leaves the
 * server. A blank field therefore means "keep" when a key is already stored,
 * and only an explicit clear action may remove it.
 */
export function resolveProviderKeyUpdate({
  clearRequested,
  hasSavedKey,
  typedKey,
}: {
  clearRequested: boolean;
  hasSavedKey: boolean;
  typedKey: string;
}): ProviderKeyUpdate {
  if (clearRequested) {
    return { kind: "clear" };
  }
  const trimmed = typedKey.trim();
  if (trimmed !== "") {
    return { kind: "set", apiKey: trimmed };
  }
  return hasSavedKey ? { kind: "keep" } : { kind: "clear" };
}

/** Maps the form intent to the router's tri-state apiKey contract. */
export function providerKeyUpdateToInput(
  update: ProviderKeyUpdate
): string | null | undefined {
  if (update.kind === "keep") {
    return undefined;
  }
  if (update.kind === "clear") {
    return null;
  }
  return update.apiKey;
}
