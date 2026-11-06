import type { Metadata } from "next";
import { EditorialStudio } from "../../../components/EditorialStudio";

export const metadata: Metadata = {
  title: "Estúdio Editorial — Church OS",
  description: "Gestão autenticada de notícias, agenda e perfis ministeriais.",
};

export default function EditorialPage() {
  return <EditorialStudio />;
}
