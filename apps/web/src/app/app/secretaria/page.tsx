import { isAdminEnabled } from "../../../lib/admin-environment";
import { HmlPhaseOne } from "../../../components/HmlPhaseOne";
import { ChurchSecretary } from "../../../components/ChurchSecretary";

export default function SecretariaPage() {
  return isAdminEnabled()
    ? <HmlPhaseOne view="secretary" />
    : <ChurchSecretary />;
}
