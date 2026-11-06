import { canEditSite,canPublishSite } from "./site-access";
import { canManageMemberships, canAccessFinance } from "./membership-scope";
import { ROLE_CODES } from "./rbac";
const church={organizationId:"org1",churchId:"rf1"};
describe("Autonomous site access",()=>{
  it("site editor can draft but cannot publish or read membership",()=>{
    const g=[{roleCode:ROLE_CODES.SITE_EDITOR,organizationId:"org1",churchId:"rf1"}];
    expect(canEditSite(g,church)).toBe(true);
    expect(canPublishSite(g,church)).toBe(false);
    expect(canManageMemberships(g,church)).toBe(false);
    expect(canAccessFinance(g,church)).toBe(false);
  });
  it("site publisher can publish but not access another congregation",()=>{
    const g=[{roleCode:ROLE_CODES.SITE_PUBLISHER,organizationId:"org1",churchId:"rf1"}];
    expect(canEditSite(g,church)).toBe(true);
    expect(canPublishSite(g,church)).toBe(true);
    expect(canEditSite(g,{organizationId:"org1",churchId:"rf2"})).toBe(false);
    expect(canEditSite([{...g[0],ministryId:"mid1"}],church)).toBe(false);
  });
  it("keeps existing secretary governance for site migration",()=>{
    const g=[{roleCode:ROLE_CODES.SECRETARIA,organizationId:"org1",churchId:"rf1"}];
    expect(canPublishSite(g,church)).toBe(true);
  });
});
