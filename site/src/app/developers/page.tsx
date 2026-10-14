import type { Metadata } from "next";
import Link from "@/components/navigation/GuardedLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { breadcrumbJsonLd, jsonLdScript, pageMetadata, productName } from "@/lib/site";

const description = "Sioona developer resources for the public MCP server, Markdown pages, and agent instructions. These read-only pages do not accept customer transcripts or product API calls.";

export const metadata: Metadata = pageMetadata("Developer resources", description, "/developers");

const resources = [
  { href: "/.well-known/mcp", label: "Sioona MCP discovery manifest", note: "JSON server card with the Streamable HTTP URL" },
  { href: "/mcp", label: "Sioona MCP server", note: "Stateless tools/list and tools/call endpoint" },
  { href: "/llms.txt", label: "Sioona agent instructions", note: "When to use Sioona, and the initialize handshake" },
  { href: "/sitemap.xml", label: "Sioona sitemap", note: "Every public URL" },
] as const;

export default function DevelopersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(breadcrumbJsonLd([
            { name: productName, path: "/" },
            { name: "Sioona developer resources", path: "/developers" },
          ])),
        }}
      />
      <PageHeader
        eyebrow="Developers"
        title="Sioona developer resources"
        description="Find the public MCP server, Markdown pages, and agent instructions. Sioona does not publish a customer-data API."
      />
      <section aria-labelledby="developers-index-title" className="section">
        <div className="container-page flex max-w-3xl flex-col gap-10">
          <div>
            <h2 id="developers-index-title" className="text-heading-24 text-sio-fg-base">
              Sioona public index
            </h2>
            <ul className="mt-5 flex flex-col gap-4">
              {resources.map((resource) => (
                <li key={resource.href}>
                  <Link href={resource.href} className="underline">
                    {resource.label}
                  </Link>
                  <p className="mt-1 text-copy-14 text-sio-fg-subtle">{resource.note}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 id="developers-mcp-title" className="text-heading-24 text-sio-fg-base">
              Sioona MCP server
            </h2>
            <div className="mt-5 flex flex-col gap-5 text-copy-16 text-sio-fg-subtle">
              <p>
                POST JSON-RPC to <code className="font-mono text-[0.9em]" translate="no">/mcp</code>. Both tools are read-only and define an input schema with typed properties and a required array.
              </p>
              <p>
                <code className="font-mono text-[0.9em]" translate="no">sioona_list_pages</code> requires <code className="font-mono text-[0.9em]" translate="no">query</code>, a string matched against public paths and titles. An empty string lists every page. <code className="font-mono text-[0.9em]" translate="no">security</code> returns the security page.
              </p>
              <p>
                <code className="font-mono text-[0.9em]" translate="no">sioona_read_page</code> requires <code className="font-mono text-[0.9em]" translate="no">path</code>, a published path from that list, such as <code className="font-mono text-[0.9em]" translate="no">/security</code> or <code className="font-mono text-[0.9em]" translate="no">/developers</code>.
              </p>
            </div>
          </div>
          <div>
            <h2 id="developers-markdown-title" className="text-heading-24 text-sio-fg-base">
              Sioona Markdown pages
            </h2>
            <p className="mt-5 text-copy-16 text-sio-fg-subtle">
              Fetch any public page with <code className="font-mono text-[0.9em]" translate="no">Accept: text/markdown</code>. HTML and Markdown responses include <code className="font-mono text-[0.9em]" translate="no">Vary: Accept</code>. Do not upload transcripts, credentials, or secrets. A pilot request still needs a person to submit the contact form.
            </p>
            <Link href="/security" className="btn-secondary mt-6">
              Sioona security
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
