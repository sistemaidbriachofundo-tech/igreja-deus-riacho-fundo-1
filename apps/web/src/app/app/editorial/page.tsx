import type { Metadata } from "next";
import { EditorialStudio } from "../../../components/EditorialStudio";

export const metadata: Metadata = {
  title: "Conteúdo e mídia — ID Riacho 1",
  description: "Gestão autenticada de notícias, agenda e perfis ministeriais.",
};

export default function EditorialPage() {
  return <EditorialStudio />;
}
