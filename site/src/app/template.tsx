/**
 * Re-mounts on every navigation, so each route fades in. Opacity only,
 * CSS-driven so server-rendered content never waits on JavaScript.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
