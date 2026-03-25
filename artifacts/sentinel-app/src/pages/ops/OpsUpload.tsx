import { useState, useRef } from "react";
import OpsLayout from "../../components/OpsLayout";
import { surface, surface2, border, border2, gold, goldDim, text, muted, muted2, mono } from "../../lib/tokens";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface UploadResult {
  ok: boolean;
  key?: string;
  url?: string;
  size?: number;
  error?: string;
}

const NAMESPACES = [
  { value: "originus/public/",  label: "Public",   desc: "originus/public/" },
  { value: "originus/hub/",     label: "Hub",       desc: "originus/hub/" },
  { value: "originus/private/", label: "Private",   desc: "originus/private/" },
  { value: "originus/assets/",  label: "Assets",    desc: "originus/assets/" },
  { value: "originus/finance/", label: "Finance",   desc: "originus/finance/" },
];

export default function OpsUpload() {
  const [ns, setNs] = useState(NAMESPACES[0].value);
  const [filename, setFilename] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function addLog(msg: string) {
    setLog(prev => [...prev.slice(-49), `[${new Date().toISOString()}] ${msg}`]);
  }

  async function handleUpload() {
    if (!file) return;
    const finalName = filename.trim() || file.name;
    const key = `${ns}${finalName}`;
    setUploading(true);
    setResult(null);
    addLog(`Uploading ${file.name} → ${key} (${(file.size / 1024).toFixed(1)} KB)`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("key", key);
      const resp = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
      const data: UploadResult = await resp.json();
      setResult(data);
      if (data.ok) {
        addLog(`✓ Uploaded → ${data.key}`);
      } else {
        addLog(`✗ Error: ${data.error}`);
      }
    } catch (e: any) {
      const err = { ok: false, error: e.message };
      setResult(err);
      addLog(`✗ Exception: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f && !filename) setFilename(f.name);
    if (f) addLog(`File selected: ${f.name} (${(f.size / 1024).toFixed(1)} KB, ${f.type || "unknown type"})`);
  }

  function clearForm() {
    setFile(null);
    setFilename("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const inputStyle: React.CSSProperties = {
    background: "#0a1020", border: `1px solid ${border}`,
    color: text, borderRadius: 3, padding: "0.55rem 0.85rem",
    fontSize: "0.84rem", width: "100%", outline: "none",
    fontFamily: "'Space Grotesk', sans-serif",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
    color: muted, textTransform: "uppercase", display: "block",
    marginBottom: "0.4rem",
  };

  return (
    <OpsLayout title="Asset Upload">
      <div style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em" }}>R2 Asset Upload</h1>
          <p style={{ color: muted, marginTop: "0.5rem", fontSize: "0.88rem", lineHeight: 1.65 }}>
            Upload assets directly to Cloudflare R2 via the API. All uploads are namespace-scoped. The <code style={{ fontFamily: mono, color: gold }}>originus/_canon/</code> namespace is permanently protected.
          </p>
        </div>

        {/* Upload Form */}
        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 6, padding: "1.75rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* Namespace */}
            <div>
              <label style={labelStyle}>R2 Namespace</label>
              <select value={ns} onChange={e => setNs(e.target.value)} style={{ ...inputStyle, appearance: "none" }}>
                {NAMESPACES.map(n => (
                  <option key={n.value} value={n.value}>{n.label} — {n.desc}</option>
                ))}
              </select>
            </div>

            {/* Filename override */}
            <div>
              <label style={labelStyle}>Filename in R2 (optional override)</label>
              <input
                type="text"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                placeholder="e.g. brand-kit-v2.zip"
                style={inputStyle}
              />
              <div style={{ marginTop: "0.35rem", fontSize: "0.68rem", color: muted2, fontFamily: mono }}>
                Full key: <span style={{ color: gold }}>{ns}{filename || "<filename>"}</span>
              </div>
            </div>

            {/* File picker */}
            <div>
              <label style={labelStyle}>File</label>
              <div
                style={{
                  border: `2px dashed ${file ? gold : border}`,
                  borderRadius: 4, padding: "1.5rem",
                  textAlign: "center", cursor: "pointer",
                  background: file ? "#0f1a2e" : "transparent",
                  transition: "border-color 0.2s",
                }}
                onClick={() => inputRef.current?.click()}
              >
                {file ? (
                  <div>
                    <div style={{ color: gold, fontWeight: 700, fontSize: "0.9rem" }}>{file.name}</div>
                    <div style={{ color: muted, fontSize: "0.75rem", marginTop: 4 }}>
                      {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown type"}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: muted, fontSize: "0.85rem" }}>
                    Click to select file<br />
                    <span style={{ fontSize: "0.7rem", color: muted2 }}>Images, PDFs, archives, JSON, or any format</span>
                  </div>
                )}
              </div>
              <input ref={inputRef} type="file" onChange={handleFileChange} style={{ display: "none" }} />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                style={{
                  background: file && !uploading ? gold : "#1e2d4a",
                  color: file && !uploading ? "#000" : muted,
                  border: "none", borderRadius: 3,
                  padding: "0.65rem 1.5rem", fontWeight: 700,
                  fontSize: "0.8rem", cursor: file && !uploading ? "pointer" : "not-allowed",
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {uploading ? "Uploading…" : "Upload to R2"}
              </button>
              <button
                onClick={clearForm}
                style={{
                  background: "transparent", color: muted,
                  border: `1px solid ${border}`, borderRadius: 3,
                  padding: "0.65rem 1.25rem", fontWeight: 600,
                  fontSize: "0.8rem", cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div style={{
            background: result.ok ? "#0d1f0d" : "#1f0d0d",
            border: `1px solid ${result.ok ? "#2a5a2a" : "#5a2a2a"}`,
            borderRadius: 4, padding: "1rem 1.25rem", marginBottom: "1.5rem",
            fontSize: "0.82rem",
          }}>
            <div style={{ fontWeight: 700, color: result.ok ? "#4ade80" : "#f87171", marginBottom: "0.4rem" }}>
              {result.ok ? "✓ Upload successful" : "✗ Upload failed"}
            </div>
            {result.ok ? (
              <div style={{ color: muted, fontFamily: mono }}>
                <div>Key: <span style={{ color: gold }}>{result.key}</span></div>
                {result.size && <div>Size: {(result.size / 1024).toFixed(1)} KB</div>}
              </div>
            ) : (
              <div style={{ color: "#f87171", fontFamily: mono }}>{result.error}</div>
            )}
          </div>
        )}

        {/* Activity Log */}
        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 6, padding: "1.25rem" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", color: muted, textTransform: "uppercase", marginBottom: "0.75rem" }}>
            Session Log
          </div>
          <div style={{ fontFamily: mono, fontSize: "0.72rem", color: muted2, lineHeight: 1.8, maxHeight: 200, overflowY: "auto" }}>
            {log.length === 0
              ? <span style={{ color: muted2 }}>No activity yet.</span>
              : log.map((l, i) => <div key={i} style={{ borderBottom: `1px solid ${border}`, padding: "0.2rem 0" }}>{l}</div>)
            }
          </div>
        </div>

        {/* R2 Governance notice */}
        <div style={{ marginTop: "1.25rem", padding: "0.85rem 1rem", background: "#0a0f1a", border: `1px solid ${border}`, borderRadius: 3, fontSize: "0.72rem", color: muted2, fontFamily: mono }}>
          <span style={{ color: "#f97316", fontWeight: 700 }}>GOVERNANCE: </span>
          Uploads are path-scoped. Canon namespace (<span style={{ color: gold }}>originus/_canon/</span>) is permanently write-protected at worker level. Finance/Private namespaces require owner-level session.
        </div>
      </div>
    </OpsLayout>
  );
}
