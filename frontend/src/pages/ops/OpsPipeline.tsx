import OpsLayout from "../../components/OpsLayout";
import { gold, surface, border, muted, muted2 } from "../../lib/tokens";

const PIPELINE_STAGES = [
  { stage: "1", name: "Content Generation",   system: "OpenAI (GPT-4o)",          status: "active",  note: "AI generates teachings, rhapsodies, and channel posts." },
  { stage: "2", name: "R2 Persistence",       system: "Cloudflare R2",            status: "active",  note: "All content written to originus/ bucket." },
  { stage: "3", name: "Auto-Publish Cycle",   system: "24h scheduler",            status: "active",  note: "Publishes to private channels on schedule. Do not modify." },
  { stage: "4", name: "Stripe Checkout",      system: "Stripe + Webhook",         status: "active",  note: "Payment confirmed → user_activation triggered." },
  { stage: "5", name: "Channel Delivery",     system: "delivery_service.py",      status: "active",  note: "Sends invite links via bot. DO NOT TOUCH this file." },
  { stage: "6", name: "Status Persistence",   system: "R2 + Express API",         status: "active",  note: "User status at originus/system/users/<id>/status.json" },
];

export default function OpsPipeline() {
  return (
    <OpsLayout>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Ops · Pipeline</div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em" }}>Execution Pipeline</h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {PIPELINE_STAGES.map(({ stage, name, system, status, note }) => (
          <div key={stage} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.25rem", display: "flex", gap: "1rem", alignItems: "flex-start" }}>
            <div style={{ background: "#1a1600", color: gold, width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800, flexShrink: 0 }}>
              {stage}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span style={{ fontWeight: 700 }}>{name}</span>
                <span style={{ fontSize: "0.7rem", color: "#22c55e", fontWeight: 700 }}>● {status}</span>
              </div>
              <div style={{ fontSize: "0.75rem", color: gold, marginBottom: "0.25rem", fontFamily: "monospace" }}>{system}</div>
              <div style={{ fontSize: "0.8rem", color: muted }}>{note}</div>
            </div>
          </div>
        ))}
      </div>
    </OpsLayout>
  );
}
