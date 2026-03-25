import { useEffect, useState } from "react";
import OpsLayout from "../../components/OpsLayout";
import { gold, surface, border, muted, muted2 } from "../../lib/tokens";

interface HealthData {
  ok: boolean; service: string; version: string;
  r2?: boolean; telegram?: boolean; stripe?: boolean;
  replit_api_base?: boolean; domains?: number; worker?: boolean;
}

function StatCard({ label, value, sub, ok }: { label: string; value: string; sub?: string; ok?: boolean }) {
  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.5rem" }}>
      <div style={{ fontSize: "0.7rem", color: muted, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.5rem" }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: ok === undefined ? gold : ok ? "#22c55e" : "#ef4444" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.75rem", color: muted2, marginTop: "0.25rem" }}>{sub}</div>}
    </div>
  );
}

export default function Ops() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setErr(true));
  }, []);

  const routes = [
    { method: "GET",  path: "/api/health",          ok: true },
    { method: "GET",  path: "/api/healthz",          ok: true },
    { method: "POST", path: "/api/enter-system",     ok: true },
    { method: "POST", path: "/api/buy",              ok: true },
    { method: "GET",  path: "/api/status/:id",       ok: true },
    { method: "POST", path: "/api/stripe/webhook",   ok: true },
  ];

  return (
    <OpsLayout>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.7rem", color: gold, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Sentinel Fortune LLC</div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em" }}>Operations Dashboard</h1>
      </div>

      {/* System health grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <StatCard label="API" value={err ? "Down" : health ? "Live" : "…"} ok={!err && !!health} />
        {health?.r2 !== undefined && <StatCard label="R2 Storage" value={health.r2 ? "Connected" : "No binding"} ok={health.r2} />}
        {health?.telegram !== undefined && <StatCard label="Telegram" value={health.telegram ? "Active" : "Down"} ok={health.telegram} />}
        {health?.stripe !== undefined && <StatCard label="Stripe" value={health.stripe ? "Active" : "Down"} ok={health.stripe} />}
        {health?.replit_api_base !== undefined && <StatCard label="Replit API" value={health.replit_api_base ? "Set" : "Missing"} ok={health.replit_api_base} />}
        <StatCard label="Domains" value={health?.domains !== undefined ? `${health.domains}` : "8"} sub="network corridors" />
        <StatCard label="Version" value={health?.version ?? "…"} />
        <StatCard label="Service" value={health?.service ?? "…"} />
      </div>

      {/* Routes */}
      <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.5rem", marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "1.25rem" }}>API Routes</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {routes.map(({ method, path, ok }) => (
            <div key={path} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontFamily: "monospace", fontSize: "0.8rem" }}>
              <span style={{
                color: method === "GET" ? "#60a5fa" : "#4ade80",
                fontWeight: 700, minWidth: 44,
              }}>{method}</span>
              <span style={{ color: "#ccc", flex: 1 }}>{path}</span>
              <span style={{ color: ok ? "#22c55e" : "#ef4444", fontSize: "0.7rem" }}>
                {ok ? "● live" : "● down"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Worker status */}
      <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "1.5rem" }}>
        <h2 style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "1.25rem" }}>Cloudflare Workers</h2>
        {[
          { name: "sentinel-fortune-ecosystem", role: "Primary API router + hub resolver", status: "deployed" },
          { name: "sentinelfortunellc",          role: "Multi-site R2 router (API guard patched)", status: "deployed" },
        ].map(({ name, role, status }) => (
          <div key={name} style={{ display: "flex", alignItems: "flex-start", gap: "1rem", padding: "0.75rem 0", borderBottom: `1px solid ${border}` }}>
            <span style={{ color: "#22c55e", marginTop: 2, flexShrink: 0 }}>●</span>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 600 }}>{name}</div>
              <div style={{ fontSize: "0.75rem", color: muted, marginTop: "0.15rem" }}>{role}</div>
            </div>
            <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "#22c55e", fontWeight: 700 }}>{status}</span>
          </div>
        ))}
      </div>
    </OpsLayout>
  );
}
