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
    <footer className="site-footer">
      <div className="container-page footer-inner">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo />
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
