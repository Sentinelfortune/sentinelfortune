import Nav from "./Nav";
import { bg, text, border, gold, BOT_LINK, muted2 } from "../lib/tokens";

interface LayoutProps {
  children: React.ReactNode;
  maxWidth?: number;
}

export default function Layout({ children, maxWidth = 1100 }: LayoutProps) {
  return (
    <div style={{ minHeight: "100vh", background: bg, color: text }}>
      <Nav />
      <main style={{ maxWidth, margin: "0 auto", padding: "2.5rem 1.5rem 5rem" }}>
        {children}
      </main>
      <footer style={{
        borderTop: `1px solid ${border}`,
        padding: "2rem 1.5rem",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ color: gold, fontWeight: 800, fontSize: "0.82rem", letterSpacing: "0.04em" }}>
              SENTINEL FORTUNE LLC
            </span>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.75rem", color: muted2, flexWrap: "wrap" }}>
            <a href={BOT_LINK} target="_blank" rel="noopener" style={{ color: muted2, textDecoration: "none" }}>@sentinelfortune_bot</a>
            <a href="https://sentinelfortune.com" style={{ color: muted2, textDecoration: "none" }}>sentinelfortune.com</a>
            <a href="/ops" style={{ color: muted2, textDecoration: "none" }}>Ops</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
