import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Status do projeto",
  description:
    "Status de engenharia do preview estático — Igreja de Deus no Riacho Fundo I.",
};

export default function StatusLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
