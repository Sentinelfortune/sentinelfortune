interface GoldButtonProps {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "fill" | "outline" | "ghost";
  fullWidth?: boolean;
  target?: string;
  rel?: string;
}

export default function GoldButton({
  href, onClick, children, size = "md",
  variant = "fill", fullWidth = false, target, rel,
}: GoldButtonProps) {
  const pad = size === "sm" ? "0.38rem 0.85rem" : size === "lg" ? "0.82rem 2rem" : "0.58rem 1.35rem";
  const fs  = size === "sm" ? "0.72rem"          : size === "lg" ? "0.9rem"       : "0.8rem";

  const style: React.CSSProperties = {
    display: "inline-block",
    padding: pad, fontSize: fs,
    fontWeight: 700,
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    textDecoration: "none",
    borderRadius: 3,
    cursor: "pointer",
    transition: "all 0.15s",
    width: fullWidth ? "100%" : undefined,
    textAlign: "center",
    border: "1px solid transparent",
    ...(variant === "fill"
      ? { background: "#c9a34f", color: "#000", borderColor: "#c9a34f" }
      : variant === "outline"
      ? { background: "transparent", color: "#c9a34f", borderColor: "#c9a34f" }
      : { background: "transparent", color: "#6b7d9a", borderColor: "#1e2d4a" }),
  };

  if (href) return <a href={href} style={style} target={target} rel={rel}>{children}</a>;
  return <button style={style} onClick={onClick}>{children}</button>;
}
