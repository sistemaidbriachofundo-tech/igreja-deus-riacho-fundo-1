import type { Metadata } from "next";
import { ServingWorkspace } from "../../../../components/serving/ServingWorkspace";

export const metadata: Metadata = {
  title: "Atmosfera — escalas",
  description: "Escalas de Atmosfera por função e horário, somente com dados de homologação.",
  robots: { index: false, follow: false },
};

export default function AtmosferaPage() {
  return <ServingWorkspace surface="atmosfera" />;
}
