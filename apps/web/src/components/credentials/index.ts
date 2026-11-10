/**
 * Integração para a frente J (view=cards), sem editar HmlPhaseOne.
 *
 * ```tsx
 * <CredentialDesk
 *   token={token}
 *   canManage={secretary}
 *   memberships={memberships.filter(m => m.status === "ACTIVE").map(m => ({
 *     membershipId: m.id,
 *     personId: m.person.id,
 *     displayName: m.person.displayName,
 *     membershipStatus: m.status,
 *     activeCredentialId: m.activeCredentialId,
 *   }))}
 *   ownCard={null}
 *   onReload={() => refresh(token)}
 * />
 * ```
 *
 * A rota /app/membros/carteirinha/ já monta esta mesa. Se o shell de HmlPhaseOne
 * voltar a ser a página, basta o trecho acima dentro de view=cards.
 */
export { CredentialDesk, type CredentialDeskProps } from "./CredentialDesk";
export { CredentialViewer } from "./CredentialViewer";
export { CredentialFaces } from "./CredentialCard";
export type { CredentialCard, CredentialMembershipRow } from "./credential-model";
