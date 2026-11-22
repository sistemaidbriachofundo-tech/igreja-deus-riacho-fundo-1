import { ApiRequestError } from "./api";

export type TeamInvitation = {
  id: string;
  personId: string;
  personName: string;
  moduleId: string;
  moduleName?: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
};

export function rosterInvitePath(ministryId: string) {
  return `/ministries/${encodeURIComponent(ministryId)}/roster-member-invitations`;
}

export function rosterRouteUnavailable(error: unknown) {
  return error instanceof ApiRequestError && (error.status === 404 || error.status === 405);
}

export function pendingTeamInvitations(result: { invitations: TeamInvitation[] }) {
  if (!Array.isArray(result.invitations)) throw new Error("Resposta de convites inválida.");
  return result.invitations.filter(item => item?.status === "PENDING" && typeof item.id === "string" && typeof item.moduleId === "string" &&
    typeof item.personId === "string" && typeof item.personName === "string");
}
