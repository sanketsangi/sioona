import Link from "@/components/navigation/GuardedLink";
import { breadcrumbJsonLd, jsonLdScript, productName, routeSeo, type PublicRoute } from "@/lib/site";

const related: Record<PublicRoute, readonly { path: PublicRoute; text: string }[]> = {
  "/": [{ path: "/how-it-works", text: "See how humans review churn and retention signals." }, { path: "/security", text: "Review data handling before sharing chat exports." }],
  "/about": [{ path: "/how-it-works", text: "Follow the export-to-evidence review workflow." }, { path: "/pricing", text: "Understand pilot scope and how pricing is agreed." }],
  "/how-it-works": [{ path: "/security", text: "Check data boundaries before preparing an export." }, { path: "/pricing", text: "Explore the two-week Shadow Mode pilot." }],
  "/security": [{ path: "/privacy", text: "Read how pilot enquiry details are handled." }, { path: "/contact", text: "Discuss security requirements before a pilot." }],
  "/pricing": [{ path: "/how-it-works", text: "See the review process used during a pilot." }, { path: "/contact", text: "Agree pilot scope before sharing customer data." }],
  "/contact": [{ path: "/privacy", text: "Check how your business contact details are used." }, { path: "/terms", text: "Read what submitting a pilot request means." }],
  "/developers": [{ path: "/how-it-works", text: "Read the product workflow behind the public facts." }, { path: "/security", text: "Understand the boundaries for customer data." }],
  "/privacy": [{ path: "/terms", text: "Review the separately agreed pilot terms." }, { path: "/security", text: "Read the security questions to resolve before transfer." }],
  "/terms": [{ path: "/privacy", text: "Review the pilot enquiry privacy notice." }, { path: "/pricing", text: "See how pilot scope and price are agreed." }],
};

/** Server-rendered context; no client pathname dependency or duplicate headings. */
export function PageContext({ path }: { path: PublicRoute }) {
  return <>
    {path !== "/" && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd([
      { name: productName, path: "/" }, { name: routeSeo[path].label, path },
    ])) }} />}
    <nav aria-label="Related resources" className="section border-t border-sio-border-base">
      <div className="container-page">
        <h2 className="text-heading-24 text-sio-fg-base">Continue exploring Sioona</h2>
        <ul className="mt-5 grid gap-6 sm:grid-cols-2">
          {related[path].map(item => <li key={item.path} className="min-w-0">
            <Link href={item.path} className="inline-flex min-h-11 items-center break-words text-copy-16 underline underline-offset-4">{routeSeo[item.path].label}</Link>
            <p className="mt-2 text-copy-14 text-sio-fg-subtle">{item.text}</p>
          </li>)}
        </ul>
      </div>
    </nav>
  </>;
}
