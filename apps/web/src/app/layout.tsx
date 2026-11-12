import type { Metadata } from "next";
import { APP_NAME } from "@idbrf/shared";
import { FeedbackProvider } from "../components/ui/FeedbackProvider";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: "%s · " + APP_NAME,
  },
  description:
    "Igreja de Deus no Riacho Fundo I, em Brasília. Conheça a igreja e confira os horários dos cultos.",
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
