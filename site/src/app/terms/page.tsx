import { PageContext } from "@/components/seo/PageContext";
import { termsParagraphs } from "@/lib/public-facts";
import { routeMetadata } from "@/lib/site";
import type { Metadata } from "next";
import Link from "@/components/navigation/GuardedLink";
import { PageHeader } from "@/components/ui/PageHeader";
export const metadata: Metadata = routeMetadata("/terms");
export default function Page() { return <><PageHeader path="/terms" eyebrow="Terms" title="Pilot request terms" description="Applies to the business contact form for pilot enquiries." /><section className="section"><div className="container-page"><h2 className="text-heading-24 mb-5">Before you request a conversation intelligence pilot</h2><div className="flex max-w-3xl flex-col gap-5 text-copy-16 text-sio-fg-subtle">{termsParagraphs.map(text => <p key={text}>{text}</p>)}<Link href="/contact" className="btn-secondary self-start">Contact Sioona</Link></div></div></section><PageContext path="/terms" /></>; }
