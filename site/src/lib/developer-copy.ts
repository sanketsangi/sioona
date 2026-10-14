/** Public endpoint documentation shared by HTML and agents. */
export const developerDescription = "Find the public MCP server, Markdown pages, and agent instructions. Sioona does not publish a customer-data API.";
export const developerResources = [
  { href: "/.well-known/mcp", label: "Sioona MCP discovery manifest", note: "JSON server card with the Streamable HTTP URL" },
  { href: "/mcp", label: "Sioona MCP server", note: "Stateless tools/list and tools/call endpoint" },
  { href: "/llms.txt", label: "Sioona agent instructions", note: "When to use Sioona, and the initialize handshake" },
  { href: "/sitemap.xml", label: "Sioona sitemap", note: "Every public URL" },
] as const;
export const developerSections = [
  { id: "developers-mcp-title", title: "Sioona MCP server", paragraphs: [
    "POST JSON-RPC to /mcp. Both tools are read-only and define an input schema with typed properties and a required array.",
    "sioona_list_pages requires query, a string matched against public paths and titles. An empty string lists every page. security returns the security page.",
    "sioona_read_page requires path, a published path from that list, such as /security or /developers.",
  ] },
  { id: "developers-markdown-title", title: "Sioona Markdown pages", paragraphs: [
    "Fetch any public page with Accept: text/markdown. HTML and Markdown responses include Vary: Accept. Do not upload transcripts, credentials, or secrets. A pilot request still needs a person to submit the contact form.",
  ] },
] as const;
