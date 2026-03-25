import Layout from "../components/Layout";
import SectionTitle from "../components/SectionTitle";
import GoldButton from "../components/GoldButton";
import { gold, surface, border, muted, muted2, BOT_LINK } from "../lib/tokens";
import { Link, useParams } from "wouter";

const TRACKS = [
  { slug: "resonance",     title: "Resonance",          artist: "Sentinel Fortune Records", tier: "starter",  duration: "3:42" },
  { slug: "sovereign-key", title: "Sovereign Key",      artist: "Sentinel Fortune Records", tier: "pro",      duration: "4:18" },
  { slug: "deep-signal",   title: "Deep Signal",        artist: "Sentinel Fortune Records", tier: "lite",     duration: "2:55" },
  { slug: "golden-mind",   title: "Golden Mind",        artist: "Sentinel Fortune Records", tier: "monthly",  duration: "5:01" },
  { slug: "execution",     title: "Execution",          artist: "Sentinel Fortune Records", tier: "starter",  duration: "3:22" },
  { slug: "the-vault",     title: "The Vault",          artist: "Sentinel Fortune Records", tier: "oem",      duration: "6:44" },
];

const TIER_COLOR: Record<string, string> = {
  lite: "#60a5fa", monthly: "#4ade80", starter: "#c9a227",
  pro: "#a78bfa", oem: "#f97316", licensing: "#ef4444",
};

function TrackList() {
  return (
    <Layout>
      <SectionTitle
        label="Sentinel Fortune Records"
        title="Music"
        sub="Audio as access signal. Tracks are tier-gated and delivered via private channels."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "3rem" }}>
        {TRACKS.map((track, i) => (
          <Link key={track.slug} href={`/music/${track.slug}`} style={{ textDecoration: "none" }}>
            <div style={{
              background: surface, border: `1px solid ${border}`,
              borderRadius: 6, padding: "1rem 1.25rem",
              display: "flex", alignItems: "center", gap: "1rem",
              transition: "border-color 0.15s",
            }}
            onMouseOver={e => e.currentTarget.style.borderColor = gold}
            onMouseOut={e => e.currentTarget.style.borderColor = border}
            >
              <span style={{ color: muted2, fontSize: "0.8rem", minWidth: 20 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.15rem" }}>{track.title}</div>
                <div style={{ fontSize: "0.75rem", color: muted }}>{track.artist}</div>
              </div>
              <span style={{
                fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem",
                borderRadius: 2, border: `1px solid ${TIER_COLOR[track.tier]}`,
                color: TIER_COLOR[track.tier], textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                {track.tier}
              </span>
              <span style={{ fontSize: "0.8rem", color: muted2, fontVariantNumeric: "tabular-nums" }}>{track.duration}</span>
            </div>
          </Link>
        ))}
      </div>
      <div style={{ background: surface, border: `1px solid ${border}`, borderLeft: `3px solid ${gold}`, borderRadius: 8, padding: "1.75rem", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>Stream premium tracks</div>
          <div style={{ fontSize: "0.875rem", color: muted }}>Unlock via Starter tier or above</div>
        </div>
        <GoldButton href={BOT_LINK} target="_blank">Stream / Premium →</GoldButton>
      </div>
    </Layout>
  );
}

function TrackDetail() {
  const { slug } = useParams<{ slug: string }>();
  const track = TRACKS.find(t => t.slug === slug);

  if (!track) return (
    <Layout>
      <p style={{ color: muted }}>Track not found. <Link href="/music" style={{ color: gold, textDecoration: "none" }}>← Back to music</Link></p>
    </Layout>
  );

  return (
    <Layout>
      <div style={{ marginBottom: "0.75rem" }}>
        <Link href="/music" style={{ fontSize: "0.8rem", color: muted2, textDecoration: "none" }}>← Music</Link>
      </div>
      <div style={{ background: surface, border: `1px solid ${border}`, borderTop: `3px solid ${gold}`, borderRadius: 8, padding: "2.5rem" }}>
        <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
          {track.artist}
        </div>
        <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.5rem" }}>
          {track.title}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
          <span style={{
            fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.65rem",
            borderRadius: 2, border: `1px solid ${TIER_COLOR[track.tier]}`,
            color: TIER_COLOR[track.tier], textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            {track.tier} tier
          </span>
          <span style={{ fontSize: "0.8rem", color: muted2 }}>{track.duration}</span>
        </div>
        <div style={{ padding: "1.25rem", background: "#0f0f00", border: `1px solid ${gold}`, borderRadius: 6, marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "0.75rem", color: gold, fontWeight: 700, marginBottom: "0.25rem" }}>STREAM REQUIRED</div>
          <div style={{ fontSize: "0.875rem", color: muted }}>Unlock {track.tier} tier or above to stream this track.</div>
        </div>
        <GoldButton href={BOT_LINK} target="_blank" size="lg">Stream / Premium →</GoldButton>
      </div>
    </Layout>
  );
}

export default function Music() {
  const params = useParams<{ slug?: string }>();
  if (params.slug) return <TrackDetail />;
  return <TrackList />;
}
