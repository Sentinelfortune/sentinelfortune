import { Link, useLocation } from "wouter";
import { gold, muted, border, text, bg, LOGO_PATH, BOT_LINK } from "../lib/tokens";
import { useState } from "react";

const navLinks = [
  { href: "/",           label: "Hub" },
  { href: "/corridors",  label: "Corridors" },
  { href: "/content",    label: "Content" },
  { href: "/music",      label: "Music" },
  { href: "/store",      label: "Store" },
  { href: "/membership", label: "Membership" },
  { href: "/agent",      label: "Agent" },
];

export default function Nav() {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: `${bg}f0`,
      backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${border}`,
      padding: "0 1.5rem",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        display: "flex", alignItems: "center",
        height: 58, gap: "2rem",
      }}>

        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", flexShrink: 0, textDecoration: "none" }}>
          <img
            src={LOGO_PATH}
            alt="Sentinel Fortune LLC"
            style={{ height: 34 }}
            onError={(e) => {
              // Fallback to text wordmark if logo not loaded
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.setAttribute("style", "display:block");
            }}
          />
          <span style={{
            display: "none", fontWeight: 800, fontSize: "0.88rem",
            color: text, letterSpacing: "-0.01em",
          }}>
            SENTINEL <span style={{ color: gold }}>FORTUNE</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div style={{ display: "flex", gap: "1.5rem", flex: 1, alignItems: "center" }}
             className="sf-desktop-nav">
          {navLinks.map(({ href, label }) => (
            <Link key={href} href={href} style={{
              fontSize: "0.82rem", fontWeight: 500,
              color: loc === href ? gold : muted,
              textDecoration: "none",
              transition: "color 0.15s",
            }}>
              {label}
            </Link>
          ))}
        </div>

        <a href={BOT_LINK} target="_blank" rel="noopener" style={{
          background: gold, color: "#000", fontWeight: 700,
          fontSize: "0.72rem", padding: "0.42rem 1rem",
          borderRadius: 3, textDecoration: "none",
          letterSpacing: "0.06em", flexShrink: 0,
          textTransform: "uppercase",
        }}>
          Open Bot
        </a>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="sf-mobile-btn"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: text, display: "none", padding: 4, fontSize: "1.1rem",
          }}
          aria-label="Menu"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <div style={{
          background: "#0d1528",
          borderTop: `1px solid ${border}`,
          padding: "1rem 1.5rem 1.5rem",
        }}>
          {navLinks.map(({ href, label }) => (
            <div key={href} style={{ padding: "0.6rem 0", borderBottom: `1px solid ${border}` }}>
              <Link href={href} onClick={() => setOpen(false)} style={{
                fontSize: "0.92rem", color: loc === href ? gold : text,
                textDecoration: "none", fontWeight: 500,
              }}>
                {label}
              </Link>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 720px) {
          .sf-desktop-nav { display: none !important; }
          .sf-mobile-btn  { display: block !important; }
        }
      `}</style>
    </nav>
  );
}
