import Nav from "./Nav";
import { bg, text, border, gold } from "../lib/tokens";
import { BOT_LINK } from "../lib/tokens";

interface LayoutProps {
  children: React.ReactNode;
  maxWidth?: number;
}

export default function Layout({ children, maxWidth = 1100 }: LayoutProps) {
  return (
    <div style={{ minHeight: "100vh", background: bg, color: text }}>
      <Nav />
      <main style={{ maxWidth, margin: "0 auto", padding: "2.5rem 1.5rem 4rem" }}>
        {children}
      </main>
      <footer style={{
        borderTop: `1px solid ${border}`,
        padding: "2rem 1.5rem",
        textAlign: "center",
        fontSize: "0.75rem",
        color: "#444",
      }}>
        <span style={{ color: gold, fontWeight: 700 }}>SENTINEL FORTUNE LLC</span>
        {" · "}
        <a href={BOT_LINK} target="_blank" rel="noopener"
           style={{ color: "#555", textDecoration: "none" }}>
          @sentinelfortune_bot
        </a>
        {" · "}
        <a href="https://sentinelfortune.com" style={{ color: "#555", textDecoration: "none" }}>
          sentinelfortune.com
        </a>
      </footer>
    </div>
  );
}
