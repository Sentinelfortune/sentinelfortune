import Layout from "../components/Layout";
import GoldButton from "../components/GoldButton";
import { gold, surface, border, muted, muted2, BOT_LINK } from "../lib/tokens";
import { useParams, Link } from "wouter";

const MODULES = [
  { slug: "overview",      title: "System Overview",          tier: "lite",    body: "The three layers explained. Where you are and what comes next." },
  { slug: "execution",     title: "Execution Frameworks",     tier: "starter", body: "Step-by-step operating systems for daily high-output work." },
  { slug: "money-engine",  title: "The Money Engine",         tier: "starter", body: "6-tier monetization architecture. Revenue as infrastructure." },
  { slug: "architecture",  title: "System Architecture",      tier: "pro",     body: "Advanced structural design. Build your own operating layer." },
  { slug: "oem-protocol",  title: "OEM Integration Protocol", tier: "oem",     body: "License the engine. Deploy it inside your infrastructure." },
];

const TIER_COLOR: Record<string, string> = {
  lite: "#60a5fa", starter: "#c9a227", pro: "#a78bfa", oem: "#f97316",
};

export default function Teachings() {
  const { slug } = useParams<{ slug: string }>();
  const module = MODULES.find(m => m.slug === slug);

  return (
    <Layout>
      <div style={{ marginBottom: "0.75rem" }}>
        <Link href="/content" style={{ fontSize: "0.8rem", color: muted2, textDecoration: "none" }}>
          ← Content Hub
        </Link>
      </div>

      {module ? (
        <>
          <div style={{
            background: surface, border: `1px solid ${border}`,
            borderTop: `3px solid ${gold}`, borderRadius: 8,
            padding: "2.5rem", marginBottom: "2rem",
          }}>
            <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{
                fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", padding: "0.2rem 0.6rem",
                borderRadius: 2, border: `1px solid ${TIER_COLOR[module.tier] ?? gold}`,
                color: TIER_COLOR[module.tier] ?? gold,
              }}>
                {module.tier}
              </span>
            </div>
            <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "1rem" }}>
              {module.title}
            </h1>
            <p style={{ fontSize: "1rem", color: muted, lineHeight: 1.7, marginBottom: "2rem" }}>
              {module.body}
            </p>
            <div style={{ padding: "1.25rem", background: "#0f0f00", border: `1px solid ${gold}`, borderRadius: 6, marginBottom: "1.75rem" }}>
              <div style={{ fontSize: "0.75rem", color: gold, fontWeight: 700, marginBottom: "0.25rem" }}>
                ACCESS REQUIRED
              </div>
              <div style={{ fontSize: "0.875rem", color: muted }}>
                This module requires the <strong style={{ color: gold }}>{module.tier}</strong> tier or higher.
                Unlock via the Telegram bot.
              </div>
            </div>
            <GoldButton href={BOT_LINK} target="_blank" size="lg">
              Unlock {module.tier.charAt(0).toUpperCase() + module.tier.slice(1)} Tier →
            </GoldButton>
          </div>
        </>
      ) : (
        <div>
          <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 800, marginBottom: "2rem" }}>
            Teachings
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "3rem" }}>
            {MODULES.map((m) => (
              <Link key={m.slug} href={`/teachings/${m.slug}`} style={{ textDecoration: "none" }}>
                <div style={{
                  background: surface, border: `1px solid ${border}`,
                  borderRadius: 8, padding: "1.25rem",
                  display: "flex", alignItems: "center", gap: "1rem",
                  transition: "border-color 0.15s",
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = gold}
                onMouseOut={e => e.currentTarget.style.borderColor = border}
                >
                  <span style={{
                    fontSize: "0.65rem", fontWeight: 700,
                    color: TIER_COLOR[m.tier] ?? gold,
                    border: `1px solid ${TIER_COLOR[m.tier] ?? gold}`,
                    padding: "0.15rem 0.5rem", borderRadius: 2,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    flexShrink: 0,
                  }}>
                    {m.tier}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>{m.title}</div>
                    <div style={{ fontSize: "0.8rem", color: muted }}>{m.body}</div>
                  </div>
                  <span style={{ color: gold, flexShrink: 0 }}>→</span>
                </div>
              </Link>
            ))}
          </div>
          <GoldButton href={BOT_LINK} target="_blank">Unlock Access via Bot →</GoldButton>
        </div>
      )}
    </Layout>
  );
}
