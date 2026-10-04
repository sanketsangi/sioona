import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { siteConfig } from "@/lib/site";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Insights", href: "/#features" },
      { label: "Signal\u00a0Score", href: "/#score" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Security", href: "/security" },
      { label: "Shadow\u00a0Mode", href: "/how-it-works#shadow-mode" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Request A Pilot", href: "/contact" },
      { label: "Contact", href: "/contact" },
      ...(siteConfig.appUrl ? [{ label: "Sign In", href: siteConfig.appUrl }] : []),
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-sio-border-base">
      <div className="container-page py-12 lg:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-copy-14 text-sio-fg-muted">
              Conversation intelligence for the chats you already have. Humans review every signal before anything is
              acted on.
            </p>
          </div>
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="eyebrow">{column.title}</h2>
              <ul className="mt-3 flex flex-col">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-8 items-center text-copy-14 text-sio-fg-subtle transition-colors duration-150 hover:text-sio-fg-base md:min-h-7"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-sio-border-base pt-6 text-label-13 text-sio-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © 2026 <span translate="no">Sioona</span>. All rights reserved.
          </p>
          <p>Sioona is not a chatbot. It never messages your customers.</p>
        </div>
      </div>
    </footer>
  );
}
