export function shouldConfirmDraftLink(input: { href: string; target: string; button: number; modified: boolean }): boolean {
  return Boolean(input.href && !input.href.startsWith("#") && input.target !== "_blank" && input.button === 0 && !input.modified);
}
