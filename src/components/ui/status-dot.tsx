import { cn } from "@/lib/utils";

const variants = {
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
  danger: "bg-[var(--danger)]",
  neutral: "bg-slate-300",
} as const;

export function StatusDot({ variant = "neutral" }: { variant?: keyof typeof variants }) {
  return <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 rounded-full", variants[variant])} />;
}
