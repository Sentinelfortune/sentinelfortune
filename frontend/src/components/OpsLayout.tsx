import { Link, useLocation } from "wouter";
import { bg, gold, border, surface, muted, muted2, text } from "../lib/tokens";

const OPS_LINKS = [
  { href: "/ops",           label: "Dashboard" },
  { href: "/ops/content",   label: "Content" },
  { href: "/ops/pipeline",  label: "Pipeline" },
  { href: "/ops/access",    label: "Access" },
  { href: "/ops/logs",      label: "Logs" },
];

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();

  return (
    <div style={{ minHeight: "100vh", background: bg, color: text, display: "flex", flexDirection: "column" }}>
      {/* Ops header */}
      <div style={{ background: "#0c0800", borderBottom: `1px solid ${gold}33`, padding: "0 1.5rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", height: 48, display: "flex", alignItems: "center", gap: "2rem" }}>
          <div style={{ fontWeight: 800, fontSize: "0.8rem", letterSpacing: "0.1em", color: gold }}>
            ◈ OPS
          </div>
          <nav style={{ display: "flex", gap: "1.5rem", flex: 1 }}>
            {OPS_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} style={{
                fontSize: "0.78rem", fontWeight: 500,
                color: loc === href ? gold : muted,
                textDecoration: "none",
              }}>
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/" style={{ fontSize: "0.75rem", color: muted2, textDecoration: "none" }}>
            ← Public
          </Link>
        </div>
      </div>

      {/* Ops content */}
      <main style={{ flex: 1, maxWidth: 1200, margin: "0 auto", width: "100%", padding: "2rem 1.5rem" }}>
        {children}
      </main>
    </div>
  );
}
