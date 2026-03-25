import Layout from "../components/Layout";
import SectionTitle from "../components/SectionTitle";
import GoldButton from "../components/GoldButton";
import { gold, surface, border, muted, muted2, text, DOMAINS, BOT_LINK } from "../lib/tokens";
import { Link } from "wouter";

const CATEGORY_ICONS: Record<string, string> = {
  hub: "◈", music: "♫", video: "▶", games: "◉", education: "◎",
  spirituality: "◇", systems: "⬡", commerce: "◻",
};

export default function Corridors() {
  return (
    <Layout>
      <SectionTitle
        label="Network Corridors"
        title="The Sentinel Fortune Network"
        sub="Eight domains. One unified identity. Each corridor is a dedicated access point to a specific layer of the system."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem", marginBottom: "4rem" }}>
        {DOMAINS.map((d) => (
          <Link key={d.id} href={`/corridors/${d.id}`} style={{ textDecoration: "none" }}>
            <div style={{
              background: surface,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: "1.75rem",
              height: "100%",
              transition: "border-color 0.15s, transform 0.15s",
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = gold; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.transform = "none"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <span style={{ fontSize: "1.5rem", color: gold }}>{CATEGORY_ICONS[d.category] ?? "◈"}</span>
                <span style={{ fontSize: "0.65rem", color: gold, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {d.category}
                </span>
              </div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: text, marginBottom: "0.25rem" }}>{d.label}</h3>
              <div style={{ fontSize: "0.75rem", color: muted2, marginBottom: "1rem" }}>{d.domain}</div>
              <div style={{ fontSize: "0.78rem", color: muted, marginBottom: "0.75rem" }}>
                Default tier: <span style={{ color: gold }}>{d.tier}</span>
              </div>
              {(d.brands.length > 0 || d.ip.length > 0) && (
                <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                  {d.brands.map((b: string) => (
                    <span key={b} style={{ fontSize: "0.58rem", color: gold, border: "1px solid #7a613033", background: "#1a140620", padding: "0.15rem 0.4rem", borderRadius: 2, letterSpacing: "0.08em", fontWeight: 700 }}>{b}</span>
                  ))}
                  {d.ip.map((ip: string) => (
                    <span key={ip} style={{ fontSize: "0.58rem", color: "#a78bfa", border: "1px solid #4a1f8c44", background: "#1a0f2a20", padding: "0.15rem 0.4rem", borderRadius: 2, letterSpacing: "0.08em", fontWeight: 700 }}>{ip}</span>
                  ))}
                </div>
              )}
              <span style={{
                fontSize: "0.75rem", fontWeight: 700,
                color: gold, letterSpacing: "0.04em",
              }}>
                {d.cta} →
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div style={{
        background: surface, border: `1px solid ${border}`,
        borderLeft: `3px solid ${gold}`, borderRadius: 8,
        padding: "2rem", textAlign: "center",
      }}>
        <p style={{ fontSize: "0.9rem", color: muted, marginBottom: "1.25rem" }}>
          All corridors route through the same monetization engine. One bot. One system.
        </p>
        <GoldButton href={BOT_LINK} target="_blank">Enter via Telegram Bot →</GoldButton>
      </div>
    </Layout>
  );
}
