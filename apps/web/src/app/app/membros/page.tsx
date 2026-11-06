import { HmlPhaseOne } from "../../../components/HmlPhaseOne";
import { MemberDirectory } from "../../../components/MemberDirectory";

export default function MembrosPage() {
  return process.env.NEXT_PUBLIC_HML_ENABLED === "true"
    ? <HmlPhaseOne view="members" />
    : <MemberDirectory />;
}
