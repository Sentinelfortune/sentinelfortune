import Layout from "../components/Layout";
import GoldButton from "../components/GoldButton";
import SectionTitle from "../components/SectionTitle";
import { surface, surface2, border, gold, goldDim, muted, muted2, mono, TIERS, BOT_START } from "../lib/tokens";

const API_BASE = "https://sentinelfortune.com";

const FEATURES: Record<string, string[]> = {
  lite:      ["Teachings Vault access", "Instant bot delivery", "Community tier"],
  monthly:   ["Reset + Quick Access channels", "Monthly subscription", "Continuity builds"],
  starter:   ["Teachings Vault (lifetime)", "Structured content library", "No expiry"],
  pro:       ["Sentinel Engine channel", "Advanced systems access", "Deep execution framework"],
  oem:       ["Sentinel Architect channel", "OEM integration rights", "Infrastructure access", "Operator support"],
  licensing: ["Sentinel Architect channel", "Institutional licensing", "Enterprise rights", "Full system access", "Deal validation"],
};

function TierFull({ tier, i }: { tier: typeof TIERS[0]; i: number }) {
  const feats = FEATURES[tier.slug] || [];
  const buyUrl = `${API_BASE}/api/buy?tier=${tier.slug}`;
  const featured = i === 2;
  return (
    <div style={{
      background: featured ? surface2 : surface,
      border: `1px solid ${featured ? gold : border}`,
      borderRadius: 6, padding: "2rem",
      display: "flex", flexDirection: "column", gap: "1rem",
      position: "relative",
    }}>
      {featured && (
        <div style={{ position: "absolute", top: -1, right: 20, background: gold, color: "#000", fontSize: "0.6rem", fontWeight: 800, padding: "0.25rem 0.65rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Most Popular
        </div>
      )}
      <div>
        <div style={{ fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.14em", color: muted, textTransform: "uppercase", marginBottom: "0.35rem" }}>{tier.channel}</div>
        <div style={{ fontWeight: 800, fontSize: "1.15rem" }}>{tier.label}</div>
        <div style={{ fontSize: "1.85rem", fontWeight: 800, color: gold, fontFamily: mono, marginTop: "0.35rem" }}>{tier.price}</div>
      </div>
      <div style={{ fontSize: "0.82rem", color: muted, lineHeight: 1.65 }}>{tier.desc}</div>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {feats.map(f => (
          <li key={f} style={{ fontSize: "0.8rem", color: muted, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: gold, fontSize: "0.6rem" }}>▸</span> {f}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "auto" }}>
        <a href={buyUrl} style={{
          display: "block", textAlign: "center",
          background: featured ? gold : "transparent",
          color: featured ? "#000" : gold,
          border: `1px solid ${gold}`,
          fontWeight: 700, fontSize: "0.76rem", padding: "0.7rem",
          borderRadius: 3, textDecoration: "none",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          Buy Access
        </a>
        <a href={BOT_START(tier.slug)} target="_blank" rel="noopener" style={{
          display: "block", textAlign: "center",
          color: muted2, fontSize: "0.7rem", textDecoration: "none",
        }}>
          Buy via Telegram Bot
        </a>
      </div>
    </div>
  );
}

export default function Membership() {
  return (
    <Layout>
      <section style={{ padding: "4rem 0 3rem", borderBottom: `1px solid ${border}`, marginBottom: "3.5rem" }}>
        <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", color: goldDim, textTransform: "uppercase", marginBottom: "1rem" }}>
          SFL Membership · Access Architecture
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5.5vw, 3.2rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 680, marginBottom: "1.2rem" }}>
          Six Access Levels.<br /><span style={{ color: gold }}>One Delivery System.</span>
        </h1>
        <p style={{ fontSize: "1rem", color: muted, maxWidth: 500, lineHeight: 1.7, marginBottom: "2rem" }}>
          Every tier is automated. Stripe handles payment. The bot handles delivery. Your private channel access is live within seconds of confirmation.
        </p>
        <GoldButton href={BOT_START("membership")} target="_blank" rel="noopener">Open @sentinelfortune_bot</GoldButton>
      </section>

      <section style={{ marginBottom: "4rem" }}>
        <SectionTitle label="Compare Tiers" title="Choose Your Level" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
          {TIERS.map((t, i) => <TierFull key={t.slug} tier={t} i={i} />)}
        </div>
      </section>

      <section style={{ background: surface, border: `1px solid ${border}`, borderRadius: 6, padding: "2rem 1.75rem" }}>
        <SectionTitle label="How It Works" title="Payment → Delivery in 3 Steps" />
        {[
          ["1 — Choose", "Select your tier and click Buy Access. Stripe checkout opens."],
          ["2 — Pay", "Complete payment on Stripe. The webhook fires immediately."],
          ["3 — Receive", "The bot delivers your private Telegram channel invite. No waiting, no manual steps."],
        ].map(([step, desc]) => (
          <div key={step} style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem", alignItems: "flex-start" }}>
            <div style={{ minWidth: 100, fontWeight: 800, fontSize: "0.82rem", color: gold, fontFamily: mono }}>{step}</div>
            <div style={{ fontSize: "0.88rem", color: muted, lineHeight: 1.65 }}>{desc}</div>
          </div>
        ))}
      </section>
    </Layout>
  );
}
