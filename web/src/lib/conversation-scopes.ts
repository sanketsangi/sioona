/** Preserve explicit empty scope; bound repeated conversation-ID query parameters. */
export function conversationScopes(ids?: string[]): (string[] | undefined)[] {
  if (ids === undefined) return [undefined];
  const unique = [...new Set(ids.filter(Boolean))];
  const scopes: string[][] = [];
  for (let start = 0; start < unique.length; start += 50) scopes.push(unique.slice(start, start + 50));
  return scopes;
}
