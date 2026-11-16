import type { Metadata } from "next";
import { BirthdaysDesk } from "../../../../components/secretaria/BirthdaysDesk";

export const metadata: Metadata = {
  title: "Aniversariantes | Secretaria — Riacho 1",
  robots: { index: false, follow: false },
};

export default function BirthdaysPage() {
  return <BirthdaysDesk />;
}
