import { useEffect, useState } from "react";
import OpsLayout from "../../components/OpsLayout";
import { gold, surface, border, muted, muted2 } from "../../lib/tokens";

interface HealthData {
  ok: boolean; service: string; version: string;
  worker: boolean; r2: boolean; replit_api_base: boolean;
  domains: number; timestamp: string;
}

export default function OpsLogs() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [workerHealth, setWorkerHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/health").then(r => r.json()).catch(() => null),
      fetch("https://sentinel-fortune-ecosystem.sentinelfortunellc.workers.dev/health")
        .then(r => r.json()).catch(() => null),
    ]).then(([local, worker]) => {
      setHealth(local);
      setWorkerHealth(worker);
      setLoading(false);
    });
  }, []);

  const Section = ({ title, data }: { title: string; data: HealthData | null }) => (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" }}>
      <h3 style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "1rem", color: gold }}>{title}</h3>
      {loading && <div style={{ color: muted, fontSize: "0.8rem" }}>Loading…</div>}
      {!loading && !data && <div style={{ color: "#ef4444", fontSize: "0.8rem" }}>Unreachable</div>}
      {data && (
        <div style={{ fontFamily: "monospace", fontSize: "0.8rem", lineHeight: 1.8, color: muted }}>
          {Object.entries(data).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: "1rem" }}>
              <span style={{ color: muted2, minWidth: 160 }}>{k}</span>
              <span style={{ color: typeof v === "boolean" ? (v ? "#22c55e" : "#ef4444") : "#c9a227" }}>
                {String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <OpsLayout>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Ops · Logs</div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em" }}>System Logs</h1>
      </div>

      <Section title="Replit API Server — /api/health" data={health} />
      <Section title="Cloudflare Worker — /health" data={workerHealth} />

      <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.5rem" }}>
        <h3 style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.75rem" }}>Key R2 Paths</h3>
        <div style={{ fontFamily: "monospace", fontSize: "0.8rem", lineHeight: 2, color: muted }}>
          {[
            ["User status",  "originus/system/users/<userId>/status.json"],
            ["Hub pages",    "originus/hub/<domain><pathname>/index.html"],
            ["Protected",    "originus/_canon/ — READ ONLY, never modify"],
            ["Sales leads",  "originus/sales/leads/<uid>_<ts>.json"],
            ["Click log",    "originus/sales/clicks/<uid>_<ts>.json"],
          ].map(([label, path]) => (
            <div key={label} style={{ display: "flex", gap: "1rem" }}>
              <span style={{ color: muted2, minWidth: 120 }}>{label}</span>
              <span style={{ color: gold }}>{path}</span>
            </div>
          ))}
        </div>
      </div>
    </OpsLayout>
  );
}
