import type { Metadata } from "next";
import { SiteManager } from "../../../components/SiteManager";

export const metadata: Metadata = {
  title: "Gestão do Site — ID Riacho 1",
  description: "Editor visual de textos, imagens, cores e organização do site da igreja.",
};

export default function SiteManagementPage() {
  return <SiteManager />;
}
