import Layout from "../components/Layout";
import SectionTitle from "../components/SectionTitle";
import GoldButton from "../components/GoldButton";
import { gold, surface, border, muted, BOT_LINK, TIERS } from "../lib/tokens";

export default function Store() {
  return (
    <Layout>
      <SectionTitle
        label="Store"
        title="Access the System"
        sub="Every purchase delivers direct access to a private Telegram channel. Automated. Immediate. No manual steps."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.25rem", marginBottom: "4rem" }}>
        {TIERS.map((tier) => (
          <div key={tier.slug} style={{
            background: surface, border: `1px solid ${border}`,
            borderRadius: 8, padding: "1.75rem",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.25rem" }}>{tier.label}</div>
                  <div style={{ fontSize: "0.75rem", color: muted }}>Unlocks: {tier.channel}</div>
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: gold }}>{tier.price}</div>
              </div>
              <p style={{ fontSize: "0.875rem", color: muted, lineHeight: 1.6, marginBottom: "1.5rem" }}>{tier.desc}</p>
            </div>
            <GoldButton href={BOT_LINK} target="_blank" fullWidth>
              Buy · {tier.price}
            </GoldButton>
          </div>
        ))}
      </div>

      <div style={{
        background: surface, border: `1px solid ${border}`,
        borderLeft: `3px solid ${gold}`, borderRadius: 8,
        padding: "2rem",
      }}>
        <h3 style={{ fontWeight: 700, marginBottom: "0.75rem" }}>How it works</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem" }}>
          {[
            { step: "1", title: "Open the Bot", body: "Launch @sentinelfortune_bot on Telegram." },
            { step: "2", title: "Choose a Tier", body: "Use /buy to select your access level." },
            { step: "3", title: "Complete Payment", body: "Stripe checkout. Secure. One click." },
            { step: "4", title: "Receive Access", body: "Private channel invite delivered automatically." },
          ].map(({ step, title, body }) => (
            <div key={step}>
              <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.1em", marginBottom: "0.4rem" }}>STEP {step}</div>
              <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>{title}</div>
              <div style={{ fontSize: "0.8rem", color: muted }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
