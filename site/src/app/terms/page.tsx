import { termsParagraphs } from "@/lib/public-facts";
import { pageMetadata } from "@/lib/site";
import type { Metadata } from "next";
import Link from "@/components/navigation/GuardedLink";
import { PageHeader } from "@/components/ui/PageHeader";
export const metadata: Metadata = pageMetadata("Pilot request terms", "Terms for requesting a Sioona pilot: business contact details, separately agreed scope and pricing, and human review of signals.", "/terms");
export default function Page() { return <><PageHeader eyebrow="Terms" title="Pilot request terms" description="Applies to the business contact form for pilot enquiries." /><section className="section"><div className="container-page"><div className="flex max-w-3xl flex-col gap-5 text-copy-16 text-sio-fg-subtle">{termsParagraphs.map(text => <p key={text}>{text}</p>)}<Link href="/contact" className="btn-secondary self-start">Contact Sioona</Link></div></div></section></>; }
