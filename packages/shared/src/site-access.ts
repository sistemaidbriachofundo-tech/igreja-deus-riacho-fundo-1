import { ROLE_CODES, hasAccess, type AuthGrant } from "./rbac";
import { canAdministerMinistries } from "./membership-scope";
import type { MembershipScopeTarget } from "./membership-scope";

/** Site only: no permission to read member dossiers, finances or confidential cases. */
export function canEditSite(grants:AuthGrant[],target:MembershipScopeTarget):boolean{
  return canAdministerMinistries(grants,target) || hasAccess(grants.filter(g=>!g.ministryId),{
    roleCodes:[ROLE_CODES.SITE_EDITOR,ROLE_CODES.SITE_PUBLISHER],
    organizationId:target.organizationId,churchId:target.churchId,
  });
}
/** Publisher may approve visible content. An editor cannot publish. */
export function canPublishSite(grants:AuthGrant[],target:MembershipScopeTarget):boolean{
  return canAdministerMinistries(grants,target) || hasAccess(grants.filter(g=>!g.ministryId),{
    roleCodes:[ROLE_CODES.SITE_PUBLISHER],
    organizationId:target.organizationId,churchId:target.churchId,
  });
}
