/** Trims sentence punctuation and unmatched closing parentheses off a URL match. */
export function trimUrlPunctuation(candidate: string): string {
  let url = candidate.replace(/[.,;:!?]+$/u, "");
  while (url.endsWith(")")) {
    const opens = url.match(/\(/gu)?.length ?? 0;
    const closes = url.match(/\)/gu)?.length ?? 0;
    if (closes <= opens) {
      break;
    }
    url = url.slice(0, -1);
  }
  return url;
}
