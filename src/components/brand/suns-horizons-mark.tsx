export function SunsHorizonsMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" role="img" aria-label="Sun’s Horizons">
      <defs>
        <linearGradient id="sun-gradient" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8C65B" />
          <stop offset="1" stopColor="#F49B45" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="14" fill="url(#sun-gradient)" />
      <path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.86 9.86l4.24 4.24M33.9 33.9l4.24 4.24M38.14 9.86l-4.24 4.24M14.1 33.9l-4.24 4.24" stroke="#1677FF" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
