import { dataFacts, pilotFacts } from "@/lib/public-facts";
import { contactPolicyText } from "@/lib/contact-policy";
import { publicHeaders } from "@/lib/http-headers";
import { agentGuidance } from "@/lib/agent-guidance";
import { routes, routeSeo, siteConfig } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const origin = siteConfig.url.replace(/\/$/, "");
  const body = `# Sioona Conversation Intelligence

${siteConfig.description}

## Product and supported inputs

${Object.values(pilotFacts).join("\n\n")}

XLSX imports require conversation_id, role and content columns. EML and MBOX imports parse exported email files, not live mailboxes. Supported Intercom JSON imports are distinct from the verified Intercom webhook integration; confirm operator setup and hosted acceptance before using live ingestion.

## Security and data boundaries

${dataFacts.map(([title, text]) => `- ${title}: ${text}`).join("\n")}

${contactPolicyText().join("\n\n")}

## Sioona pages

${routes.map(path => `- [${routeSeo[path].label}](${new URL(path, origin).href})`).join("\n")}
- [Sitemap](${origin}/sitemap.xml): every public page and these instructions

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
