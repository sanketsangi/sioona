/** Public marketing origin only; never forward workspace/query data to intake. */
export function pilotContactHref(origin = process.env.NEXT_PUBLIC_SITE_URL): string {
  try {
    const url = new URL(origin?.trim() || "https://sioona.si");
    if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return "https://sioona.si/contact";
    return `${url.origin}/contact`;
  } catch { return "https://sioona.si/contact"; }
}
