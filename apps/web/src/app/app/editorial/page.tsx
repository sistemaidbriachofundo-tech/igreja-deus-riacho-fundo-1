import type { Metadata } from "next";
import { EditorialStudio } from "../../../components/EditorialStudio";

export const metadata: Metadata = {
  title: "Conteúdo e mídia — ID Riacho 1",
  description: "Gestão da agenda pública e acesso à edição da capa do portal.",
};

export default function EditorialPage() {
  return <EditorialStudio />;
}
