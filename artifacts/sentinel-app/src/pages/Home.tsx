import Layout from "../components/Layout";
import GoldButton from "../components/GoldButton";
import SectionTitle from "../components/SectionTitle";
import {
  surface, border, border2, gold, goldDim, text, muted, muted2, mono,
  TIERS, BRANDS, IP_UNIVERSE, DOMAINS, BOT_START,
} from "../lib/tokens";

function TierCard({ tier }: { tier: typeof TIERS[0] }) {
  const buyUrl = `https://sentinelfortune.com/api/buy?tier=${tier.slug}`;
  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 6, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", color: muted, textTransform: "uppercase" }}>{tier.channel}</div>
      <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{tier.label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 800, color: gold, fontFamily: mono }}>{tier.price}</div>
      <div style={{ fontSize: "0.82rem", color: muted, lineHeight: 1.6, flex: 1 }}>{tier.desc}</div>
      <a href={buyUrl} style={{ display: "block", textAlign: "center", background: gold, color: "#000", fontWeight: 700, fontSize: "0.74rem", padding: "0.55rem", borderRadius: 3, textDecoration: "none", letterSpacing: "0.06em", textTransform: "uppercase" }}>Buy Access</a>
    </div>
  );
}

function BrandChip({ brand }: { brand: typeof BRANDS[0] }) {
  return (
    <div style={{ border: `1px solid ${border2}`, background: surface, borderRadius: 4, padding: "0.85rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <div style={{ fontWeight: 800, fontSize: "0.92rem", color: text }}>{brand.label}</div>
      <div style={{ fontSize: "0.62rem", color: muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{brand.category}</div>
    </div>
  );
}

function IPCard({ ip }: { ip: typeof IP_UNIVERSE[0] }) {
  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 6, padding: "2rem", borderLeft: `3px solid ${ip.color}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.5rem" }}>
        <span style={{ fontWeight: 800, fontSize: "1.2rem", color: text }}>{ip.label}</span>
        <span style={{ fontSize: "0.7rem", color: muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{ip.sub}</span>
      </div>
      <p style={{ fontSize: "0.87rem", color: muted, lineHeight: 1.7, marginBottom: "1.25rem" }}>{ip.desc}</p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {ip.domains.map(d => (
          <a key={d} href={`https://${d}`} target="_blank" rel="noopener" style={{ fontSize: "0.7rem", color: gold, border: `1px solid ${goldDim}`, padding: "0.25rem 0.6rem", borderRadius: 2, textDecoration: "none", letterSpacing: "0.04em" }}>{d}</a>
        ))}
      </div>
    </div>
  );
}

function CorridorRow({ d }: { d: typeof DOMAINS[0] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", borderBottom: `1px solid ${border}`, padding: "1rem 0" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{d.label}</div>
        <div style={{ fontSize: "0.7rem", color: muted, marginTop: 2 }}>{d.domain}</div>
      </div>
      <div style={{ fontSize: "0.75rem", color: muted, flex: 2, minWidth: 160 }}>{d.desc}</div>
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {d.brands.map(b => (
          <span key={b} style={{ fontSize: "0.6rem", color: gold, border: `1px solid ${goldDim}`, padding: "0.18rem 0.45rem", borderRadius: 2, letterSpacing: "0.08em" }}>{b}</span>
        ))}
        {d.ip.map(ip => (
          <span key={ip} style={{ fontSize: "0.6rem", color: "#a78bfa", border: "1px solid #4a1f8c", padding: "0.18rem 0.45rem", borderRadius: 2, letterSpacing: "0.08em" }}>{ip}</span>
        ))}
      </div>
      <a href={`https://${d.domain}`} target="_blank" rel="noopener" style={{ fontSize: "0.72rem", color: gold, textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}>Visit →</a>
    </div>
  );
}

export default function Home() {
  return (
    <Layout>
      {/* Hero */}
      <section style={{ padding: "5rem 0 4rem", borderBottom: `1px solid ${border}`, marginBottom: "4rem" }}>
        <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", color: goldDim, textTransform: "uppercase", marginBottom: "1.5rem" }}>
          Sentinel Fortune LLC · Institutional Command Hub
        </div>
        <h1 style={{ fontSize: "clamp(2.4rem, 7vw, 4.5rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, maxWidth: 800, marginBottom: "1.5rem" }}>
          The Operating<br /><span style={{ color: gold }}>Framework</span> for<br />Builders Who Execute.
        </h1>
        <p style={{ fontSize: "1.05rem", color: muted, maxWidth: 520, lineHeight: 1.7, marginBottom: "2.5rem" }}>
          Private access. Automated delivery. Structured tiers. Eight domains. One system. Your entry starts with a single command.
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <GoldButton href={BOT_START("home")} target="_blank" rel="noopener" size="lg">Enter via Telegram</GoldButton>
          <GoldButton href="/store" variant="outline" size="lg">View Access Tiers</GoldButton>
        </div>
        <div style={{ marginTop: "2.5rem", fontSize: "0.7rem", color: muted2, fontFamily: mono }}>
          → /start · /enter · /buy · /status — live on @sentinelfortune_bot
        </div>
      </section>

      {/* Commercial Brands */}
      <section style={{ marginBottom: "4rem" }}>
        <SectionTitle label="Commercial Brands" title="The SFL Brand Network" sub="Eight brands operating under the Sentinel Fortune institutional framework — lifestyle, music, commerce, and systems." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.75rem" }}>
          {BRANDS.map(b => <BrandChip key={b.id} brand={b} />)}
        </div>
      </section>

      {/* IP Universe */}
      <section style={{ marginBottom: "4rem" }}>
        <SectionTitle label="IP Universe" title="Active Creative Intelligence" sub="Fictional universes with real operational weight — content, games, and coded intelligence layered across the network." />
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {IP_UNIVERSE.map(ip => <IPCard key={ip.id} ip={ip} />)}
        </div>
      </section>

      {/* Access Tiers */}
      <section style={{ marginBottom: "4rem" }}>
        <SectionTitle label="Access Tiers" title="Six Levels. One System." sub="From first contact at $2 to full institutional licensing at $15,000. Every tier delivers via private Telegram channel." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
          {TIERS.map(t => <TierCard key={t.slug} tier={t} />)}
        </div>
      </section>

      {/* Corridors Summary */}
      <section style={{ marginBottom: "4rem" }}>
        <SectionTitle label="Network Corridors" title="Eight Domains. One Sovereign Network." sub="Each domain is a specialized corridor within the Sentinel Fortune institutional framework." />
        <div>{DOMAINS.map(d => <CorridorRow key={d.id} d={d} />)}</div>
        <div style={{ marginTop: "1.5rem" }}>
          <GoldButton href="/corridors" variant="outline">Explore All Corridors →</GoldButton>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "3rem 2rem", textAlign: "center" }}>
        <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.14em", color: goldDim, marginBottom: "0.75rem", textTransform: "uppercase" }}>Ready to enter?</div>
        <h2 style={{ fontSize: "clamp(1.4rem, 3.5vw, 2rem)", fontWeight: 700, marginBottom: "1rem" }}>Access begins with one message.</h2>
        <p style={{ color: muted, maxWidth: 440, margin: "0 auto 2rem", lineHeight: 1.65 }}>
          Open the bot, send /start, and the system reads your state immediately. Every tier delivers within seconds of payment confirmation.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <GoldButton href={BOT_START("cta")} target="_blank" rel="noopener" size="lg">Open @sentinelfortune_bot</GoldButton>
          <GoldButton href="/membership" variant="outline" size="lg">View Membership Tiers</GoldButton>
        </div>
      </section>
    </Layout>
  );
}
