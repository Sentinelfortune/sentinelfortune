import Layout from "../components/Layout";
import SectionTitle from "../components/SectionTitle";
import GoldButton from "../components/GoldButton";
import { gold, surface, border, muted, muted2, BOT_LINK } from "../lib/tokens";

const COMMANDS = [
  { cmd: "/start",  desc: "Open the system. Triggers the onboarding sequence." },
  { cmd: "/enter",  desc: "Register in the system. Creates your account record." },
  { cmd: "/buy",    desc: "Select and purchase a tier. Returns a Stripe payment link." },
  { cmd: "/status", desc: "Check your current tier and delivery state." },
];

export default function Agent() {
  return (
    <Layout>
      <SectionTitle
        label="Telegram Agent"
        title="@sentinelfortune_bot"
        sub="The bot is the primary access interface. All tier purchases, channel delivery, and account management happen here."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem", marginBottom: "4rem" }}>
        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "2rem" }}>
          <h3 style={{ fontWeight: 700, marginBottom: "1.25rem" }}>Bot Commands</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {COMMANDS.map(({ cmd, desc }) => (
              <div key={cmd} style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                <code style={{
                  background: "#1a1a00", color: gold,
                  padding: "0.15rem 0.5rem", borderRadius: 4,
                  fontSize: "0.85rem", fontWeight: 700,
                  flexShrink: 0, fontFamily: "monospace",
                }}>
                  {cmd}
                </code>
                <span style={{ fontSize: "0.8rem", color: muted, lineHeight: 1.5 }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "2rem" }}>
          <h3 style={{ fontWeight: 700, marginBottom: "1.25rem" }}>How Access Works</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[
              { step: "1", text: "Open the bot. /start triggers onboarding." },
              { step: "2", text: "/enter registers your user ID in the system." },
              { step: "3", text: "/buy [tier] returns a Stripe checkout link with your ID embedded." },
              { step: "4", text: "After payment, access is delivered automatically to this chat." },
            ].map(({ step, text }) => (
              <div key={step} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <span style={{ background: "#1a1600", color: gold, width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, flexShrink: 0 }}>
                  {step}
                </span>
                <span style={{ fontSize: "0.85rem", color: muted, lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "3rem" }}>
        {[
          { label: "Never accesses R2 directly", icon: "⬡" },
          { label: "API-only architecture", icon: "◎" },
          { label: "Retry logic on API failure", icon: "◇" },
          { label: "Minimal session state", icon: "◈" },
        ].map(({ label, icon }) => (
          <div key={label} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ color: gold, fontSize: "1.25rem" }}>{icon}</span>
            <span style={{ fontSize: "0.8rem", color: muted }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ background: surface, border: `1px solid ${border}`, borderLeft: `3px solid ${gold}`, borderRadius: 8, padding: "2.5rem", textAlign: "center" }}>
        <h2 style={{ fontWeight: 700, fontSize: "1.25rem", marginBottom: "0.75rem" }}>Open the Agent</h2>
        <p style={{ color: muted, fontSize: "0.9rem", marginBottom: "1.75rem" }}>
          Click below to open @sentinelfortune_bot in Telegram. Use /start to begin.
        </p>
        <GoldButton href={BOT_LINK} target="_blank" size="lg">Open @sentinelfortune_bot →</GoldButton>
      </div>
    </Layout>
  );
}
