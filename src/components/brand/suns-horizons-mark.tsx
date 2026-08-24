import Image from "next/image";

/** The real Sun's Horizons mark (sunshorizons.be), not an invented substitute. */
export function SunsHorizonsMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Sun’s Horizons"
      width={150}
      height={120}
      className={`${className} object-contain`}
      priority
    />
  );
}
