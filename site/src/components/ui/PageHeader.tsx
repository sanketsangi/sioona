import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { breadcrumbJsonLd, jsonLdScript, nb, productName, type PublicRoute } from "@/lib/site";

export function PageHeader({
  path,
  eyebrow,
  title,
  description,
}: {
  path?: PublicRoute;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <>
      {path && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd([{ name: productName, path: "/" }, { name: eyebrow, path }])) }} />}
      <header className="pb-12 pt-14 sm:pt-20 lg:pb-16 lg:pt-28">
        <RevealGroup className="container-page max-w-4xl" gap={0.07}>
          <RevealItem>
            <p className="eyebrow">{eyebrow}</p>
          </RevealItem>
          <RevealItem>
            <h1 className="text-heading-40 mt-3 text-sio-fg-base md:text-heading-56">{nb(title)}</h1>
          </RevealItem>
          {description ? (
            <RevealItem>
              <p className="text-copy-18 mt-5 max-w-2xl text-sio-fg-subtle">{nb(description)}</p>
            </RevealItem>
          ) : null}
        </RevealGroup>
      </header>
    </>
  );
}
