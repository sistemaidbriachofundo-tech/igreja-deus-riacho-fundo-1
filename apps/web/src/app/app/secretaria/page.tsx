import { HmlPhaseOne } from "../../../components/HmlPhaseOne";
import { ChurchSecretary } from "../../../components/ChurchSecretary";

export default function SecretariaPage() {
  return process.env.NEXT_PUBLIC_HML_ENABLED === "true"
    ? <HmlPhaseOne view="secretary" />
    : <ChurchSecretary />;
}
