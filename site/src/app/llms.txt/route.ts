import { markdownFor } from "@/lib/markdown-pages";
import { publicHeaders } from "@/lib/http-headers";
import { agentGuidance } from "@/lib/agent-guidance";
import { siteConfig } from "@/lib/site";

export function GET() {
  const origin = siteConfig.url.replace(/\/$/, "");
  const body = `# Sioona Conversation Intelligence

${siteConfig.description}

${markdownFor("/pricing")}

${markdownFor("/security")}

## Sioona pages

- [Home](${origin}/): product overview
- [About](${origin}/about): who Sioona is, how Shadow Mode works, and what a pilot includes
- [How it works](${origin}/how-it-works): connect, detect, review, act
- [Security](${origin}/security): human review, tenant isolation, no outbound messaging
- [Pricing](${origin}/pricing): two-week pilot, scope agreed before start
- [Request a pilot](${origin}/contact): business contact form with a stored receipt
- [Sioona developer resources](${origin}/developers): MCP server, Markdown pages, and agent instructions
- [Privacy](${origin}/privacy): how pilot-request contact details are used
- [Terms](${origin}/terms): what submitting a pilot request does and does not create
- [Sitemap](${origin}/sitemap.xml): every public URL

${agentGuidance()}
`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
      ...publicHeaders,
    },
  });
}
