import Layout from "../components/Layout";
import GoldButton from "../components/GoldButton";
import SectionTitle from "../components/SectionTitle";
import { surface, surface2, border, border2, gold, goldDim, text, muted, muted2, mono, TIERS, BRANDS, BOT_START } from "../lib/tokens";

const API_BASE = "https://sentinelfortune.com";

function TierCard({ tier, featured }: { tier: typeof TIERS[0]; featured?: boolean }) {
  const buyUrl = `${API_BASE}/api/buy?tier=${tier.slug}`;
  return (
    <div style={{
      background: featured ? surface2 : surface,
      border: `1px solid ${featured ? gold : border}`,
      borderRadius: 6, padding: "1.75rem",
      display: "flex", flexDirection: "column", gap: "0.75rem",
      position: "relative",
    }}>
      {featured && (
        <div style={{ position: "absolute", top: -1, right: 20, background: gold, color: "#000", fontSize: "0.6rem", fontWeight: 800, padding: "0.25rem 0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Popular
        </div>
      )}
      <div style={{ fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.14em", color: muted, textTransform: "uppercase" }}>{tier.channel}</div>
      <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{tier.label}</div>
      <div style={{ fontSize: "1.7rem", fontWeight: 800, color: gold, fontFamily: mono }}>{tier.price}</div>
      <div style={{ fontSize: "0.82rem", color: muted, lineHeight: 1.65, flex: 1 }}>{tier.desc}</div>
      <a href={buyUrl} style={{
        display: "block", textAlign: "center",
        background: featured ? gold : "transparent",
        color: featured ? "#000" : gold,
        border: `1px solid ${gold}`,
        fontWeight: 700, fontSize: "0.74rem", padding: "0.65rem",
        borderRadius: 3, textDecoration: "none",
        letterSpacing: "0.06em", textTransform: "uppercase",
        marginTop: "0.5rem",
      }}>
        Buy Access
      </a>
    </div>
  );
}

function BrandCard({ brand }: { brand: typeof BRANDS[0] }) {
  return (
    <div style={{ border: `1px solid ${border2}`, background: surface, borderRadius: 5, padding: "1.25rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-start" }}>
      <div style={{ fontWeight: 800, fontSize: "1rem", color: text, letterSpacing: "0.02em" }}>{brand.label}</div>
      <div style={{ fontSize: "0.65rem", color: muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{brand.category}</div>
      <a href={`https://${brand.domain}`} target="_blank" rel="noopener" style={{ fontSize: "0.68rem", color: gold, textDecoration: "none", marginTop: "auto", paddingTop: "0.5rem" }}>{brand.domain} →</a>
    </div>
  );
}

export default function Store() {
  return (
    <Layout>
      {/* Hero */}
      <section style={{ padding: "4rem 0 3rem", borderBottom: `1px solid ${border}`, marginBottom: "3.5rem" }}>
        <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", color: goldDim, textTransform: "uppercase", marginBottom: "1rem" }}>
          SFL Store · Access Commerce
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700, marginBottom: "1.25rem" }}>
          Buy Access.<br /><span style={{ color: gold }}>Get Delivered.</span>
        </h1>
        <p style={{ fontSize: "1rem", color: muted, maxWidth: 500, lineHeight: 1.7, marginBottom: "2rem" }}>
          Every purchase is processed via Stripe and confirmed via the bot. Access is delivered to your private Telegram channel within seconds.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <GoldButton href={BOT_START("store")} target="_blank" rel="noopener">Buy via Telegram Bot</GoldButton>
          <GoldButton href="/membership" variant="outline">Compare Memberships</GoldButton>
        </div>
      </section>

      {/* Access Tiers */}
      <section style={{ marginBottom: "4rem" }}>
        <SectionTitle label="Access Tiers" title="Six Levels. One Delivery System." sub="Choose your tier. Pay via Stripe. Receive your private channel access immediately." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: "1rem" }}>
          {TIERS.map((t, i) => <TierCard key={t.slug} tier={t} featured={i === 2} />)}
        </div>
        <div style={{ marginTop: "1.5rem", padding: "1rem 1.25rem", background: surface, border: `1px solid ${border}`, borderRadius: 4, fontSize: "0.78rem", color: muted }}>
          <span style={{ color: gold, fontWeight: 700 }}>How it works: </span>
          Click Buy Access → Stripe checkout opens → Pay → Bot receives webhook → Channel invite delivered automatically. No manual steps.
        </div>
      </section>

      {/* Brand Commerce */}
      <section style={{ marginBottom: "4rem" }}>
        <SectionTitle label="Brand Showcase" title="The SFL Brand Network" sub="Commercial brands operating under the Sentinel Fortune framework. Each brand connects to a dedicated domain corridor." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.75rem" }}>
          {BRANDS.map(b => <BrandCard key={b.id} brand={b} />)}
        </div>
      </section>

      {/* OEM / Licensing CTA */}
      <section style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "2.5rem 2rem", display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.14em", color: goldDim, marginBottom: "0.5rem", textTransform: "uppercase" }}>OEM + Institutional Licensing</div>
          <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.75rem" }}>Integrate the Engine.</h3>
          <p style={{ fontSize: "0.85rem", color: muted, lineHeight: 1.65 }}>
            The OEM tier at $7,500 and Institutional License at $15,000 grant you integration rights into your own infrastructure. Full architecture access, deal validation, and direct operator support.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 180 }}>
          <GoldButton href={`${API_BASE}/api/buy?tier=oem`} size="lg">OEM License — $7,500</GoldButton>
          <GoldButton href={`${API_BASE}/api/buy?tier=licensing`} variant="outline" size="lg">Institutional — $15,000</GoldButton>
        </div>
      </section>
    </Layout>
  );
}
