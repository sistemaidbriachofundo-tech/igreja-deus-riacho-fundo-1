import { ChurchCredentials } from "../../../../components/ChurchCredentials";

/**
 * A rota abre a mesa visual (frente, verso, PDF e QR).
 * HmlPhaseOne não é alterado. Para recolocá-la no shell da HML, importe
 * CredentialDesk de components/credentials dentro de view=cards.
 */
export default function CarteirinhaPage() {
  return <ChurchCredentials />;
}
