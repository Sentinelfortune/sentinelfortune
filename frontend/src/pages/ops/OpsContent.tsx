import OpsLayout from "../../components/OpsLayout";
import { gold, surface, border, muted, muted2 } from "../../lib/tokens";

const CONTENT_TYPES = [
  { type: "Teachings",   count: "5 modules",  tiers: "lite → licensing" },
  { type: "Rhapsodies",  count: "4 entries",  tiers: "starter → licensing" },
  { type: "Music",       count: "6 tracks",   tiers: "lite → oem" },
  { type: "Games",       count: "3 games",    tiers: "pro → licensing" },
];

export default function OpsContent() {
  return (
    <OpsLayout>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Ops · Content</div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em" }}>Content Registry</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {CONTENT_TYPES.map(({ type, count, tiers }) => (
          <div key={type} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.25rem" }}>
            <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>{type}</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: gold, marginBottom: "0.25rem" }}>{count}</div>
            <div style={{ fontSize: "0.75rem", color: muted2 }}>Tiers: {tiers}</div>
          </div>
        ))}
      </div>

      <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.5rem" }}>
        <div style={{ fontSize: "0.75rem", color: muted, lineHeight: 1.7 }}>
          Content is stored in Cloudflare R2 under <code style={{ color: gold }}>originus/</code> prefix.
          The auto-publish scheduler runs on a 24-hour cycle and publishes to private Telegram channels.
          Do not modify <code style={{ color: gold }}>originus/_canon/</code> — this is write-protected.
        </div>
      </div>
    </OpsLayout>
  );
}
