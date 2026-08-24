import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kids Track — Sun’s Horizons",
  description: "Gestion professionnelle des présences des enfants pour Sun’s Horizons ASBL.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
