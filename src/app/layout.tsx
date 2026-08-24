import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sun’s Horizons — Gestion des présences",
  description: "Gestion professionnelle des présences des enfants pour Sun’s Horizons.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
