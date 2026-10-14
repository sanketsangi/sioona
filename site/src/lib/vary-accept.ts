import { VARY } from "./http-headers";
/** Keep Accept in Vary when Next replaces the header with its router list. */
export function varyWithAccept(current: string | number | readonly string[] | undefined): string {
  const parts: string[] = [];
  const add = (value: string) => {
    for (const part of value.split(",")) {
      const token = part.trim();
      if (!token) continue;
      if (parts.some((existing) => existing.toLowerCase() === token.toLowerCase())) continue;
      parts.push(token);
    }
  };
  if (Array.isArray(current)) {
    for (const value of current) add(String(value));
  } else if (current != null && current !== "") {
    add(String(current));
  }
  add(VARY);
  return parts.join(", ");
}
