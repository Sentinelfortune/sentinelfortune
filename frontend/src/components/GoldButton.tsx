interface GoldButtonProps {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "fill" | "outline" | "ghost";
  fullWidth?: boolean;
  target?: string;
}

export default function GoldButton({
  href,
  onClick,
  children,
  size = "md",
  variant = "fill",
  fullWidth = false,
  target,
}: GoldButtonProps) {
  const pad = size === "sm" ? "0.4rem 0.9rem" : size === "lg" ? "0.85rem 2rem" : "0.6rem 1.4rem";
  const fs  = size === "sm" ? "0.75rem"        : size === "lg" ? "0.95rem"      : "0.82rem";

  const style: React.CSSProperties = {
    display: "inline-block",
    padding: pad,
    fontSize: fs,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textDecoration: "none",
    borderRadius: 4,
    cursor: "pointer",
    transition: "all 0.15s",
    border: "none",
    width: fullWidth ? "100%" : undefined,
    textAlign: "center",
    ...(variant === "fill"
      ? { background: "#c9a227", color: "#000" }
      : variant === "outline"
      ? { background: "transparent", color: "#c9a227", border: "1px solid #c9a227" }
      : { background: "transparent", color: "#888", border: "1px solid #2a2a2a" }),
  };

  if (href) {
    return <a href={href} style={style} target={target}>{children}</a>;
  }
  return <button style={style} onClick={onClick}>{children}</button>;
}
