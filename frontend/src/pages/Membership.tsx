import Layout from "../components/Layout";
import SectionTitle from "../components/SectionTitle";
import GoldButton from "../components/GoldButton";
import { gold, surface, border, muted, muted2, text, BOT_LINK, TIERS } from "../lib/tokens";

const CHANNEL_MAP: Record<string, string> = {
  "lite":      "Teachings Vault",
  "monthly":   "Reset Channel + Quick Access",
  "starter":   "Teachings Vault",
  "pro":       "Sentinel Engine",
  "oem":       "Sentinel Architect",
  "licensing": "Sentinel Architect",
};

const FEATURES: Record<string, string[]> = {
  "lite":      ["Teachings Vault access", "Basic execution content", "Telegram channel delivery"],
  "monthly":   ["Reset Channel", "Quick Access channel", "Monthly structured resets", "Recurring continuity"],
  "starter":   ["Full Teachings Vault", "Structured framework library", "No expiry", "Single payment"],
  "pro":       ["Sentinel Engine channel", "Advanced systems", "Deep execution frameworks", "All Starter content"],
  "oem":       ["Sentinel Architect channel", "OEM integration protocol", "All Pro content", "License infrastructure"],
  "licensing": ["Sentinel Architect", "Institutional rights", "Enterprise integration", "Full system access"],
};

const HIGHLIGHT_TIERS = new Set(["starter", "pro"]);

export default function Membership() {
  return (
    <Layout>
      <SectionTitle
        label="Membership"
        title="Choose Your Access Tier"
        sub="Six tiers. One engine. Every tier delivers immediate private channel access via Telegram after payment."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.25rem", marginBottom: "4rem" }}>
        {TIERS.map((tier) => {
          const highlighted = HIGHLIGHT_TIERS.has(tier.slug);
          return (
            <div key={tier.slug} style={{
              background: highlighted ? "#111800" : surface,
              border: `1px solid ${highlighted ? gold : border}`,
              borderRadius: 8,
              padding: "2rem",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}>
              {highlighted && (
                <div style={{
                  position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)",
                  background: gold, color: "#000", fontSize: "0.65rem", fontWeight: 800,
                  letterSpacing: "0.08em", padding: "0.2rem 0.75rem",
                  borderRadius: "0 0 4px 4px", textTransform: "uppercase",
                }}>
                  Popular
                </div>
              )}

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>{tier.label}</div>
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: 800, color: gold, marginBottom: "0.5rem" }}>
                  {tier.price}
                </div>
                <div style={{ fontSize: "0.75rem", color: muted2, marginBottom: "1.25rem" }}>
                  Delivers: {CHANNEL_MAP[tier.slug]}
                </div>
                <p style={{ fontSize: "0.85rem", color: muted, lineHeight: 1.6, marginBottom: "1.25rem" }}>{tier.desc}</p>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {(FEATURES[tier.slug] ?? []).map((f) => (
                    <li key={f} style={{ fontSize: "0.8rem", color: muted, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ color: gold, flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <GoldButton
                href={BOT_LINK}
                target="_blank"
                fullWidth
                variant={highlighted ? "fill" : "outline"}
              >
                Unlock {tier.label} →
              </GoldButton>
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <div style={{ marginBottom: "4rem" }}>
        <h2 style={{ fontWeight: 700, fontSize: "1.25rem", marginBottom: "1.5rem" }}>Frequently Asked</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            { q: "How is access delivered?", a: "Automatically via Telegram. After payment confirmation, you receive a private channel invite in the bot chat." },
            { q: "Can I upgrade?", a: "Yes. Message the bot with /buy and select a higher tier. Your access is updated automatically." },
            { q: "Is there a trial?", a: "Starter Lite at $2 is the entry point. This is not a trial — it is real access at the lowest price point." },
            { q: "What is the OEM license for?", a: "The OEM tier allows you to integrate the Sentinel Fortune engine into your own product or infrastructure." },
          ].map(({ q, a }) => (
            <div key={q} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.25rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>{q}</div>
              <div style={{ fontSize: "0.875rem", color: muted, lineHeight: 1.6 }}>{a}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: surface, border: `1px solid ${border}`, borderLeft: `3px solid ${gold}`, borderRadius: 8, padding: "2rem", textAlign: "center" }}>
        <p style={{ color: muted, marginBottom: "1.25rem" }}>Open the bot. Use /buy. Access delivered in seconds.</p>
        <GoldButton href={BOT_LINK} target="_blank" size="lg">Open @sentinelfortune_bot →</GoldButton>
      </div>
    </Layout>
  );
}
