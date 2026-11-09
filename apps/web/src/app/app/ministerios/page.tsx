import type { Metadata } from "next";
import { MinistryDeskPage } from "../../../components/MinistryDeskPage";

export const metadata: Metadata = {
  title: "Integrantes do ministério",
  description: "Catálogo formal de integrantes, separado do interesse de voluntariado.",
  robots: { index: false, follow: false },
};

export default function MinisteriosFormaisPage() {
  return <MinistryDeskPage />;
}
