import Layout from "../components/Layout";
import GoldButton from "../components/GoldButton";
import { gold, muted, surface, border, text, muted2, BOT_LINK, DOMAINS, TIERS } from "../lib/tokens";
import { Link } from "wouter";

function HeroBadge({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "0.2rem 0.65rem",
      fontSize: "0.65rem",
      fontWeight: 700,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      border: `1px solid ${gold}`,
      color: gold,
      borderRadius: 2,
      marginBottom: "1.5rem",
    }}>
      {label}
    </span>
  );
}

export default function Home() {
  return (
    <Layout>
      {/* Hero */}
      <section style={{ paddingTop: "4rem", paddingBottom: "5rem", textAlign: "center" }}>
        <HeroBadge label="Sentinel Fortune LLC · Execution Layer" />
        <h1 style={{
          fontSize: "clamp(2.5rem, 7vw, 4.5rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "0 auto 1.5rem",
          maxWidth: 800,
        }}>
          The Operating Framework<br />
          <span style={{ color: gold }}>for Builders Who Execute</span>
        </h1>
        <p style={{
          fontSize: "1.1rem",
          color: muted,
          maxWidth: 520,
          margin: "0 auto 2.5rem",
          lineHeight: 1.65,
        }}>
          Not content. Not motivation. A structured system built for
          people who have stopped waiting.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <GoldButton href={BOT_LINK} target="_blank" size="lg">
            Open Telegram Bot →
          </GoldButton>
          <GoldButton href="/membership" size="lg" variant="outline">
            View Tiers
          </GoldButton>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${border}`, marginBottom: "4rem" }} />

      {/* Three pillars */}
      <section style={{ marginBottom: "5rem" }}>
        <div style={{
          fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em",
          color: gold, textTransform: "uppercase", marginBottom: "1rem",
        }}>
          The System
        </div>
        <h2 style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "3rem" }}>
          Three Layers. One Engine.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem" }}>
          {[
            { num: "01", title: "Structure", body: "Every tier is mapped to a private Telegram channel with curated, non-public content." },
            { num: "02", title: "Delivery", body: "Access is automated. Pay → receive. No manual steps. No waiting on a human." },
            { num: "03", title: "Execution", body: "The system runs 24 hours. Content publishes. Channels stay live. You stay active." },
          ].map(({ num, title, body }) => (
            <div key={num} style={{
              background: surface,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: "1.75rem",
            }}>
              <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
                {num}
              </div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>{title}</h3>
              <p style={{ fontSize: "0.875rem", color: muted, lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Corridors preview */}
      <section style={{ marginBottom: "5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.75rem" }}>
          <div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", color: gold, textTransform: "uppercase", marginBottom: "0.5rem" }}>
              Network Corridors
            </div>
            <h2 style={{ fontSize: "clamp(1.25rem, 3vw, 1.75rem)", fontWeight: 700, letterSpacing: "-0.02em" }}>
              8 Domains. One Identity.
            </h2>
          </div>
          <Link href="/corridors" style={{ fontSize: "0.8rem", color: gold, textDecoration: "none" }}>
            View all →
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
          {DOMAINS.slice(0, 4).map((d) => (
            <Link key={d.id} href={`/corridors/${d.id}`} style={{ textDecoration: "none" }}>
              <div style={{
                background: surface,
                border: `1px solid ${border}`,
                borderRadius: 8,
                padding: "1.25rem",
                transition: "border-color 0.15s",
              }}
              onMouseOver={e => (e.currentTarget.style.borderColor = gold)}
              onMouseOut={e => (e.currentTarget.style.borderColor = border)}
              >
                <div style={{ fontSize: "0.65rem", color: gold, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                  {d.category}
                </div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, color: text, marginBottom: "0.25rem" }}>
                  {d.label}
                </div>
                <div style={{ fontSize: "0.75rem", color: muted2 }}>{d.domain}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Tiers preview */}
      <section style={{ marginBottom: "5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.75rem" }}>
          <div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", color: gold, textTransform: "uppercase", marginBottom: "0.5rem" }}>
              Monetization
            </div>
            <h2 style={{ fontSize: "clamp(1.25rem, 3vw, 1.75rem)", fontWeight: 700, letterSpacing: "-0.02em" }}>
              6 Tiers. One Engine.
            </h2>
          </div>
          <Link href="/membership" style={{ fontSize: "0.8rem", color: gold, textDecoration: "none" }}>
            All tiers →
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
          {TIERS.slice(0, 3).map((tier) => (
            <div key={tier.slug} style={{
              background: surface,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: "1.5rem",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{tier.label}</span>
                <span style={{ color: gold, fontWeight: 700, fontSize: "0.9rem" }}>{tier.price}</span>
              </div>
              <p style={{ fontSize: "0.8rem", color: muted, marginBottom: "1.25rem", lineHeight: 1.5 }}>{tier.desc}</p>
              <GoldButton href={BOT_LINK} target="_blank" size="sm" fullWidth>
                Unlock via Bot
              </GoldButton>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section style={{
        background: surface,
        border: `1px solid ${border}`,
        borderLeft: `3px solid ${gold}`,
        borderRadius: 8,
        padding: "2.5rem",
        textAlign: "center",
      }}>
        <h2 style={{ fontSize: "clamp(1.25rem, 3vw, 1.75rem)", fontWeight: 700, marginBottom: "0.75rem" }}>
          Ready to enter the system?
        </h2>
        <p style={{ color: muted, fontSize: "0.9rem", marginBottom: "1.75rem" }}>
          Open the Telegram bot. Use /enter to register. Use /buy to unlock your tier.
        </p>
        <GoldButton href={BOT_LINK} target="_blank" size="lg">
          Start with @sentinelfortune_bot →
        </GoldButton>
      </section>
    </Layout>
  );
}
