import Link from "@/components/navigation/GuardedLink";
import Image from "next/image";
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
      { label: "About", href: "/about" },
      { label: "Security", href: "/security" },
      { label: "Shadow\u00a0Mode", href: "/how-it-works#shadow-mode" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Request a pilot", href: "/contact" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      ...(siteConfig.appUrl ? [{ label: "Sign In", href: siteConfig.appUrl }] : []),
    ],
  },
];

export function Footer() {
  return (
    <footer className="site-footer footer-premium">
      <div className="container-page footer-inner">
        <div className="footer-masthead">
          <Link href="/" className="footer-wordmark" aria-label="Sioona, home" translate="no">
            <span className="footer-mark-wrap" aria-hidden>
              <Image src="/sioona-footer.svg" alt="" width={43} height={43} unoptimized className="footer-mark" />
            </span>
            <span>Sioona<span className="footer-brand-period" aria-hidden>.</span></span>
          </Link>
          <p className="footer-brand-line">Conversation intelligence.<br />Human judgment.</p>
        </div>
        <div className="footer-grid">
          <div className="footer-brand">
            <p className="footer-brand-eyebrow">Clarity starts with a conversation.</p>
            <p className="footer-description">
              Conversation intelligence for the chats you already have. Humans review every signal before anything is
              acted on.
            </p>
          </div>
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="footer-column-title">{column.title}</h2>
              <ul className="footer-links">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="footer-link"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <p>
            © 2026 <span translate="no">Sioona</span>. All rights reserved.
          </p>
          <p>Sioona is not a chatbot. It never messages your customers.</p>
        </div>
      </div>
    </footer>
  );
}
