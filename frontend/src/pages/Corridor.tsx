import Layout from "../components/Layout";
import GoldButton from "../components/GoldButton";
import { gold, surface, border, muted, muted2, text, DOMAINS, TIERS, BOT_LINK, BOT_START } from "../lib/tokens";
import { useParams, Link } from "wouter";

export default function Corridor() {
  const { id } = useParams<{ id: string }>();
  const domain = DOMAINS.find(d => d.id === id);

  if (!domain) {
    return (
      <Layout>
        <div style={{ textAlign: "center", paddingTop: "4rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>◈</div>
          <h1 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Corridor not found</h1>
          <p style={{ color: muted, marginBottom: "1.5rem" }}>This domain is not mapped in the network.</p>
          <Link href="/corridors" style={{ color: gold, textDecoration: "none" }}>← All corridors</Link>
        </div>
      </Layout>
    );
  }

  const tier = TIERS.find(t => t.slug === domain.tier) ?? TIERS[0];
  const entryPayload = `entry_${domain.id}_${domain.tier}`;

  return (
    <Layout>
      <div style={{ marginBottom: "0.75rem" }}>
        <Link href="/corridors" style={{ fontSize: "0.8rem", color: muted2, textDecoration: "none" }}>
          ← Network Corridors
        </Link>
      </div>

      <div style={{
        background: surface, border: `1px solid ${border}`,
        borderTop: `3px solid ${gold}`, borderRadius: 8,
        padding: "2.5rem", marginBottom: "2rem",
      }}>
        <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
          {domain.category}
        </div>
        <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 2.75rem)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.5rem" }}>
          {domain.label}
        </h1>
        <div style={{ fontSize: "0.85rem", color: muted, marginBottom: "2rem" }}>
          {domain.domain}
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <GoldButton href={BOT_START(entryPayload)} target="_blank" size="lg">
            {domain.cta} →
          </GoldButton>
          <GoldButton href={`https://${domain.domain}`} target="_blank" size="lg" variant="outline">
            Visit Domain
          </GoldButton>
        </div>
      </div>

      {/* Tier info */}
      <div style={{
        background: surface, border: `1px solid ${border}`,
        borderRadius: 8, padding: "2rem", marginBottom: "2rem",
      }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1.25rem" }}>Default Access Tier</h2>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <span style={{ fontWeight: 700 }}>{tier.label}</span>
          <span style={{ color: gold, fontWeight: 700 }}>{tier.price}</span>
        </div>
        <p style={{ fontSize: "0.875rem", color: muted, lineHeight: 1.6, marginBottom: "1.5rem" }}>{tier.desc}</p>
        <div style={{ fontSize: "0.8rem", color: muted2, marginBottom: "1.25rem" }}>
          Unlocks: <span style={{ color: text }}>{tier.channel}</span>
        </div>
        <GoldButton href={BOT_START(entryPayload)} target="_blank" fullWidth>
          Unlock {tier.label} · {tier.price}
        </GoldButton>
      </div>

      {/* Other tiers */}
      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1.25rem" }}>All Access Tiers</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
          {TIERS.map((t) => (
            <div key={t.slug} style={{
              background: t.slug === domain.tier ? "#1a1600" : surface,
              border: `1px solid ${t.slug === domain.tier ? gold : border}`,
              borderRadius: 6, padding: "1rem",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{t.label}</span>
              </div>
              <div style={{ color: gold, fontSize: "0.85rem", fontWeight: 700 }}>{t.price}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
