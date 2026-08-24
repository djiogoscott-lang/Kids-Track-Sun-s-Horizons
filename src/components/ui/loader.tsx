const DOT_COLORS = ["var(--brand-red)", "var(--brand-blue)", "var(--brand-gold)", "var(--brand-green)"];

/**
 * The brand loader: four dots lighting up in sequence, echoing the four
 * colors in the Sun's Horizons mark. No text by default — the animation
 * alone should read as "preparing", never as a build/compile indicator.
 */
export function Loader({ size = "md" }: { size?: "sm" | "md" }) {
  const dot = size === "sm" ? "h-2 w-2" : "h-3 w-3";
  const gap = size === "sm" ? "gap-2" : "gap-3";

  return (
    <div className={`flex items-center justify-center ${gap}`} role="status" aria-label="Chargement">
      {DOT_COLORS.map((color, i) => (
        <span
          key={color}
          className={`${dot} animate-loader-dot rounded-full`}
          style={{ backgroundColor: color, animationDelay: `${i * 180}ms` }}
        />
      ))}
    </div>
  );
}

/** Full-screen variant for the splash and route-level loading states. */
export function LoaderScreen({ caption }: { caption?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white">
      <Loader />
      {caption ? <p className="animate-fade-in text-sm text-[var(--muted)]">{caption}</p> : null}
    </div>
  );
}
