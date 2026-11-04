import type { Metadata } from "next";
import { APP_NAME } from "@idbrf/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "Preview estático F1-SEC — sistema de gestão eclesiástica (dados fictícios)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
