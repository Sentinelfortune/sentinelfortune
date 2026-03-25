import Layout from "../components/Layout";
import GoldButton from "../components/GoldButton";
import { gold, surface, border, muted, muted2, BOT_LINK } from "../lib/tokens";
import { useParams, Link } from "wouter";

const RHAPSODIES = [
  { slug: "overview",       title: "The Rhapsody Framework",         body: "Narrative intelligence as a system component." },
  { slug: "sovereignty",    title: "Sovereign Operator",             body: "What it means to operate outside the conventional system." },
  { slug: "silence",        title: "The Architecture of Silence",    body: "How silence generates strategic advantage." },
  { slug: "flow-state",     title: "Flow State as Infrastructure",   body: "Peak performance as a repeatable, engineered state." },
];

export default function Rhapsodies() {
  const { slug } = useParams<{ slug: string }>();
  const rhapsody = RHAPSODIES.find(r => r.slug === slug);

  return (
    <Layout>
      <div style={{ marginBottom: "0.75rem" }}>
        <Link href="/content" style={{ fontSize: "0.8rem", color: muted2, textDecoration: "none" }}>← Content Hub</Link>
      </div>
      {rhapsody ? (
        <div style={{ background: surface, border: `1px solid ${border}`, borderTop: `3px solid ${gold}`, borderRadius: 8, padding: "2.5rem" }}>
          <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            Rhapsody
          </div>
          <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "1rem" }}>
            {rhapsody.title}
          </h1>
          <p style={{ fontSize: "1rem", color: muted, lineHeight: 1.7, marginBottom: "2rem" }}>{rhapsody.body}</p>
          <div style={{ padding: "1.25rem", background: "#0f0f00", border: `1px solid ${gold}`, borderRadius: 6, marginBottom: "1.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: gold, fontWeight: 700, marginBottom: "0.25rem" }}>MEMBERSHIP REQUIRED</div>
            <div style={{ fontSize: "0.875rem", color: muted }}>Full rhapsodies are available to Starter tier and above.</div>
          </div>
          <GoldButton href={BOT_LINK} target="_blank" size="lg">Unlock via Bot →</GoldButton>
        </div>
      ) : (
        <div>
          <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 800, marginBottom: "2rem" }}>Rhapsodies</h1>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "3rem" }}>
            {RHAPSODIES.map((r) => (
              <Link key={r.slug} href={`/rhapsodies/${r.slug}`} style={{ textDecoration: "none" }}>
                <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.25rem", transition: "border-color 0.15s" }}
                  onMouseOver={e => e.currentTarget.style.borderColor = gold}
                  onMouseOut={e => e.currentTarget.style.borderColor = border}>
                  <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{r.title}</div>
                  <div style={{ fontSize: "0.8rem", color: muted }}>{r.body}</div>
                </div>
              </Link>
            ))}
          </div>
          <GoldButton href={BOT_LINK} target="_blank">Unlock Access →</GoldButton>
        </div>
      )}
    </Layout>
  );
}
