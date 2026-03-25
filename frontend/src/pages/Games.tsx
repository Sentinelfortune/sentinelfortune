import Layout from "../components/Layout";
import GoldButton from "../components/GoldButton";
import { gold, surface, border, muted, muted2, BOT_LINK } from "../lib/tokens";
import { useParams, Link } from "wouter";

const GAMES = [
  { slug: "overview",     title: "Lumen Game Platform",       tier: "pro",  desc: "The game layer of the Sentinel Fortune ecosystem." },
  { slug: "sovereign",    title: "Sovereign Operator Game",   tier: "pro",  desc: "Build and run your own sovereign operation in real time." },
  { slug: "mind-engine",  title: "Mind Engine",               tier: "pro",  desc: "A strategy game built on the Sentinel execution framework." },
];

export default function Games() {
  const { slug } = useParams<{ slug: string }>();
  const game = slug ? GAMES.find(g => g.slug === slug) : null;

  if (game) return (
    <Layout>
      <div style={{ marginBottom: "0.75rem" }}>
        <Link href="/corridors/lumengame" style={{ fontSize: "0.8rem", color: muted2, textDecoration: "none" }}>← Lumen Game</Link>
      </div>
      <div style={{ background: surface, border: `1px solid ${border}`, borderTop: `3px solid ${gold}`, borderRadius: 8, padding: "2.5rem" }}>
        <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
          Lumen Game Ecosystem · {game.tier}
        </div>
        <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "1rem" }}>
          {game.title}
        </h1>
        <p style={{ fontSize: "1rem", color: muted, lineHeight: 1.7, marginBottom: "2rem" }}>{game.desc}</p>
        <div style={{ padding: "1.25rem", background: "#0f0f00", border: `1px solid ${gold}`, borderRadius: 6, marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "0.75rem", color: gold, fontWeight: 700, marginBottom: "0.25rem" }}>PLAY REQUIRED</div>
          <div style={{ fontSize: "0.875rem", color: muted }}>This game requires the <strong style={{ color: gold }}>{game.tier}</strong> tier.</div>
        </div>
        <GoldButton href={BOT_LINK} target="_blank" size="lg">Play Now →</GoldButton>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div style={{ marginBottom: "2.5rem" }}>
        <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Lumen Game</div>
        <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.02em" }}>Games</h1>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1.25rem", marginBottom: "3rem" }}>
        {GAMES.map(g => (
          <Link key={g.slug} href={`/games/${g.slug}`} style={{ textDecoration: "none" }}>
            <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.75rem", transition: "border-color 0.15s" }}
              onMouseOver={e => e.currentTarget.style.borderColor = gold}
              onMouseOut={e => e.currentTarget.style.borderColor = border}>
              <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>{g.title}</div>
              <div style={{ fontSize: "0.8rem", color: muted, marginBottom: "1rem" }}>{g.desc}</div>
              <span style={{ fontSize: "0.75rem", color: gold, fontWeight: 700 }}>Play Now →</span>
            </div>
          </Link>
        ))}
      </div>
      <GoldButton href={BOT_LINK} target="_blank">Unlock Pro Access →</GoldButton>
    </Layout>
  );
}
