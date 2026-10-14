/** True when text/markdown outranks text/html. A browser Accept header does not. */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const quality = (mime: string) => {
    let best = 0;
    let seen = false;
    for (const part of accept.split(",")) {
      const [rawType, ...params] = part.trim().split(";");
      const type = rawType.trim().toLowerCase();
      if (type !== mime) continue;
      let q = 1;
      for (const param of params) {
        const [key, value] = param.split("=");
        if (key?.trim().toLowerCase() !== "q") continue;
        const parsed = Number(value);
        q = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
      }
      seen = true;
      best = Math.max(best, q);
    }
    return seen ? best : 0;
  };
  const markdown = quality("text/markdown");
  const html = quality("text/html");
  return markdown > 0 && markdown > html;
}
