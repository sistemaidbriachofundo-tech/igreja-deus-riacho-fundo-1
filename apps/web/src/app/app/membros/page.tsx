import { isAdminEnabled } from "../../../lib/admin-environment";
import { HmlPhaseOne } from "../../../components/HmlPhaseOne";
import { MemberDirectory } from "../../../components/MemberDirectory";

export default function MembrosPage() {
  return isAdminEnabled()
    ? <HmlPhaseOne view="members" />
    : <MemberDirectory />;
}
