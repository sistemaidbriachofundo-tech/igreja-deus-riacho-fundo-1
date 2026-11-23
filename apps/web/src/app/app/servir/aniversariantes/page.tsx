import type { Metadata } from "next";
import { CareBirthdays } from "../../../../components/secretaria/CareBirthdays";

export const metadata: Metadata = {
  title: "Aniversariantes do cuidado — Riacho 1",
  robots: { index: false, follow: false },
};

export default function CareBirthdaysPage() {
  return <CareBirthdays />;
}
