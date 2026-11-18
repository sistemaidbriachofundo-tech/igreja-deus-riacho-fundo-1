import type { Metadata } from "next";
import { APP_NAME } from "@idbrf/shared";
import { FeedbackProvider } from "../components/ui/FeedbackProvider";
import { officialLogoAsset } from "../lib/brand";
import { withBasePath } from "../lib/paths";
import "@fontsource/source-sans-pro/300.css";
import "@fontsource/source-sans-pro/400.css";
import "@fontsource/source-sans-pro/600.css";
import "@fontsource/source-sans-pro/700.css";
import "@fontsource/source-sans-pro/900.css";
import "@fontsource/source-sans-pro/700-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: "%s · " + APP_NAME,
  },
  description:
    "Igreja de Deus no Riacho Fundo I, em Brasília. Conheça a igreja e confira os horários dos cultos.",
  manifest: withBasePath("/roster.webmanifest"),
  icons: { icon: withBasePath(officialLogoAsset), shortcut: withBasePath(officialLogoAsset), apple: withBasePath("/images/portal-voluntario-192.png") },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body><FeedbackProvider>{children}</FeedbackProvider></body>
    </html>
  );
}
