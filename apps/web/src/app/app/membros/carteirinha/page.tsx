import { HmlPhaseOne } from "../../../../components/HmlPhaseOne";
import { ChurchCredentials } from "../../../../components/ChurchCredentials";

export default function CarteirinhaPage() {
  return process.env.NEXT_PUBLIC_HML_ENABLED === "true"
    ? <HmlPhaseOne view="cards" />
    : <ChurchCredentials />;
}
