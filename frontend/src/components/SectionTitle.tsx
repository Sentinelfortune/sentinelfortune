import { gold, muted } from "../lib/tokens";

interface SectionTitleProps {
  label?: string;
  title: string;
  sub?: string;
}

export default function SectionTitle({ label, title, sub }: SectionTitleProps) {
  return (
    <div style={{ marginBottom: "2.5rem" }}>
      {label && (
        <div style={{
          fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em",
          color: gold, textTransform: "uppercase", marginBottom: "0.5rem",
        }}>
          {label}
        </div>
      )}
      <h2 style={{
        fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
        fontWeight: 700, letterSpacing: "-0.02em",
        margin: 0, lineHeight: 1.15,
      }}>
        {title}
      </h2>
      {sub && (
        <p style={{ fontSize: "1rem", color: muted, marginTop: "0.75rem", maxWidth: 560 }}>
          {sub}
        </p>
      )}
    </div>
  );
}
