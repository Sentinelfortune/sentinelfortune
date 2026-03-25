import Layout from "../components/Layout";
import SectionTitle from "../components/SectionTitle";
import GoldButton from "../components/GoldButton";
import { gold, surface, border, muted, BOT_LINK } from "../lib/tokens";
import { Link } from "wouter";

const CONTENT_CATEGORIES = [
  { slug: "teachings",   label: "Teachings",   icon: "◎", sub: "Structured execution frameworks, unlocked per tier.",     link: "/teachings/overview" },
  { slug: "rhapsodies",  label: "Rhapsodies",  icon: "◇", sub: "Narrative intelligence. The philosophy behind the engine.", link: "/rhapsodies/overview" },
  { slug: "music",       label: "Music",       icon: "♫", sub: "Sentinel Fortune Records. Audio as access signal.",        link: "/music" },
  { slug: "games",       label: "Games",       icon: "◉", sub: "Interactive layers. Lumen Game ecosystem.",                link: "/games/overview" },
];

export default function Content() {
  return (
    <Layout>
      <SectionTitle
        label="Content Hub"
        title="What's Inside the System"
        sub="All content is tier-gated. Access is delivered via private Telegram channels after payment."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.25rem", marginBottom: "4rem" }}>
        {CONTENT_CATEGORIES.map((cat) => (
          <Link key={cat.slug} href={cat.link} style={{ textDecoration: "none" }}>
            <div style={{
              background: surface, border: `1px solid ${border}`,
              borderRadius: 8, padding: "2rem", height: "100%",
              transition: "border-color 0.15s",
            }}
            onMouseOver={e => e.currentTarget.style.borderColor = gold}
            onMouseOut={e => e.currentTarget.style.borderColor = border}
            >
              <div style={{ fontSize: "2rem", color: gold, marginBottom: "1rem" }}>{cat.icon}</div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>{cat.label}</h3>
              <p style={{ fontSize: "0.875rem", color: muted, lineHeight: 1.6, marginBottom: "1.25rem" }}>{cat.sub}</p>
              <span style={{ fontSize: "0.75rem", color: gold, fontWeight: 700 }}>Explore →</span>
            </div>
          </Link>
        ))}
      </div>

      <div style={{
        background: surface, border: `1px solid ${border}`,
        borderLeft: `3px solid ${gold}`, borderRadius: 8,
        padding: "2rem", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexWrap: "wrap", gap: "1rem",
      }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>All content requires a tier to unlock.</div>
          <div style={{ fontSize: "0.875rem", color: muted }}>Start at $2. Upgrade any time.</div>
        </div>
        <GoldButton href={BOT_LINK} target="_blank">Unlock via Bot →</GoldButton>
      </div>
    </Layout>
  );
}
