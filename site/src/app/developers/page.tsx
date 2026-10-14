import { developerDescription, developerResources, developerSections } from "@/lib/developer-copy";
import type { Metadata } from "next";
import Link from "@/components/navigation/GuardedLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { breadcrumbJsonLd, jsonLdScript, pageMetadata, productName } from "@/lib/site";

const description = "Sioona developer resources for the public MCP server, Markdown pages, and agent instructions. These read-only pages do not accept customer transcripts or product API calls.";

export const metadata: Metadata = pageMetadata("Developer resources", description, "/developers");

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
        description={developerDescription}
      />
      <section aria-labelledby="developers-index-title" className="section">
        <div className="container-page flex max-w-3xl flex-col gap-10">
          <div>
            <h2 id="developers-index-title" className="text-heading-24 text-sio-fg-base">
              Sioona public index
            </h2>
            <ul className="mt-5 flex flex-col gap-4">
              {developerResources.map((resource) => (
                <li key={resource.href}>
                  <a href={resource.href === "/mcp" ? "#developers-mcp-title" : resource.href} className="underline">
                    {resource.label}
                  </a>
                  <p className="mt-1 text-copy-14 text-sio-fg-subtle">{resource.note}</p>
                </li>
              ))}
            </ul>
          </div>
          {developerSections.map(section => <section key={section.id} aria-labelledby={section.id}>
            <h2 id={section.id} className="text-heading-24 text-sio-fg-base">{section.title}</h2>
            <div className="mt-5 flex flex-col gap-5 text-copy-16 text-sio-fg-subtle break-words">{section.paragraphs.map(text => <p key={text}>{text}</p>)}</div>
          </section>)}
          <div>
            <Link href="/security" className="btn-secondary mt-6">
              Sioona security
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
