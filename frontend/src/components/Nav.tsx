import { Link, useLocation } from "wouter";
import { gold, muted, surface, border, text, bg } from "../lib/tokens";
import { BOT_LINK } from "../lib/tokens";
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
      background: bg, borderBottom: `1px solid ${border}`,
      padding: "0 1.5rem",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        display: "flex", alignItems: "center",
        height: 56, gap: "2rem",
      }}>
        <Link href="/" style={{
          fontWeight: 700, fontSize: "0.95rem",
          color: text, letterSpacing: "-0.02em",
          textDecoration: "none", flexShrink: 0,
        }}>
          SENTINEL FORTUNE
        </Link>

        {/* Desktop nav */}
        <div style={{ display: "flex", gap: "1.5rem", flex: 1, alignItems: "center" }}
             className="desktop-nav">
          {navLinks.map(({ href, label }) => (
            <Link key={href} href={href} style={{
              fontSize: "0.8rem", fontWeight: 500,
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
          fontSize: "0.75rem", padding: "0.4rem 1rem",
          borderRadius: 4, textDecoration: "none",
          letterSpacing: "0.04em", flexShrink: 0,
        }}>
          OPEN BOT
        </a>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="mobile-menu-btn"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: text, display: "none", padding: 4,
          }}
          aria-label="Menu"
        >
          <span style={{ fontSize: "1.25rem" }}>{open ? "✕" : "☰"}</span>
        </button>
      </div>

      {open && (
        <div style={{
          background: surface, borderTop: `1px solid ${border}`,
          padding: "1rem 1.5rem 1.5rem",
        }}>
          {navLinks.map(({ href, label }) => (
            <div key={href} style={{ padding: "0.5rem 0" }}>
              <Link href={href} onClick={() => setOpen(false)} style={{
                fontSize: "0.9rem", color: loc === href ? gold : text,
                textDecoration: "none", fontWeight: 500,
              }}>
                {label}
              </Link>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 700px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
      `}</style>
    </nav>
  );
}
