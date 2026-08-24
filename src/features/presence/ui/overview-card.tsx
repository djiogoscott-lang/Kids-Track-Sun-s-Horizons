import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function OverviewCard({
  href,
  icon,
  iconColor,
  iconBg,
  title,
  headline,
  stats,
  cta,
  tourId,
}: {
  href: string;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  title: string;
  headline: string;
  stats: React.ReactNode;
  cta: string;
  tourId?: string;
}) {
  return (
    <Link href={href} className="tap-scale block" data-tour={tourId}>
      <Card className="transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_10px_rgba(16,33,62,0.06),0_20px_40px_-16px_rgba(16,33,62,0.22)]">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: iconBg, color: iconColor }}>
              {icon}
            </span>
            <p className="font-heading text-lg font-bold uppercase tracking-wide text-[var(--foreground)]">{title}</p>
          </div>

          <p className="mt-4 text-3xl font-extrabold text-[var(--foreground)]">{headline}</p>
          <div className="mt-1 text-sm font-medium text-[var(--muted)]">{stats}</div>

          <div className="mt-4 flex items-center gap-1 text-sm font-bold" style={{ color: iconColor }}>
            {cta}
            <ArrowRight size={16} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
