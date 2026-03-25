import { gold, muted } from "../lib/tokens";

interface SectionTitleProps {
  label?: string;
  title: string;
  sub?: string;
  center?: boolean;
}

export default function SectionTitle({ label, title, sub, center = false }: SectionTitleProps) {
  return (
    <div style={{ marginBottom: "2.5rem", textAlign: center ? "center" : undefined }}>
      {label && (
        <div style={{
          fontSize: "0.67rem", fontWeight: 700, letterSpacing: "0.14em",
          color: gold, textTransform: "uppercase", marginBottom: "0.6rem",
        }}>
          {label}
        </div>
      )}
      <h2 style={{
        fontSize: "clamp(1.5rem, 4vw, 2.2rem)",
        fontWeight: 700, letterSpacing: "-0.02em",
        margin: 0, lineHeight: 1.15,
      }}>
        {title}
      </h2>
      {sub && (
        <p style={{
          fontSize: "1rem", color: muted,
          marginTop: "0.75rem",
          maxWidth: center ? 580 : 560,
          margin: center ? "0.75rem auto 0" : "0.75rem 0 0",
          lineHeight: 1.65,
        }}>
          {sub}
        </p>
      )}
    </div>
  );
}
