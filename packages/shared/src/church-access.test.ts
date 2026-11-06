import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROLE_CODES } from "./rbac";
import {
  canAccessChurch,
  canReadAudit,
  explicitChurchIdsFromGrants,
  hasOrgWideGrant,
  isPlatformAdminInOrg,
  resolveDefaultActiveContext,
} from "./church-access";

describe("church-access F6", () => {
  const org = "org1";
  const rf1 = "church-rf1";
  const rf2 = "church-rf2";

  it("allows church-scoped grant only on that church", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: org,
        churchId: rf1,
      },
    ];
    assert.equal(
      canAccessChurch(grants, { organizationId: org, churchId: rf1 }),
      true,
    );
    assert.equal(
      canAccessChurch(grants, { organizationId: org, churchId: rf2 }),
      false,
    );
  });

  it("org-wide PLATFORM_ADMIN covers any church in org", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.PLATFORM_ADMIN,
        organizationId: org,
        churchId: null,
      },
    ];
    assert.equal(isPlatformAdminInOrg(grants, org), true);
    assert.equal(
      canAccessChurch(grants, { organizationId: org, churchId: rf2 }),
      true,
    );
    assert.equal(
      canReadAudit(grants, { organizationId: org, churchId: rf2 }),
      true,
    );
    assert.equal(hasOrgWideGrant(grants, org), true);
  });

  it("secretaria reads audit only in own church", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: org,
        churchId: rf1,
      },
    ];
    assert.equal(
      canReadAudit(grants, { organizationId: org, churchId: rf1 }),
      true,
    );
    assert.equal(
      canReadAudit(grants, { organizationId: org, churchId: rf2 }),
      false,
    );
  });

  it("lists explicit church ids and defaults active to pilot when covered", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: org,
        churchId: rf2,
      },
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: org,
        churchId: rf1,
      },
    ];
    assert.deepEqual(
      new Set(explicitChurchIdsFromGrants(grants, org)),
      new Set([rf1, rf2]),
    );
    const active = resolveDefaultActiveContext(grants, {
      organizationId: org,
      churchId: rf1,
    });
    assert.equal(active.churchId, rf1);
    assert.equal(active.organizationId, org);
  });

  it("defaults to first explicit church when pilot not covered", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.MEMBRO,
        organizationId: org,
        churchId: rf2,
      },
    ];
    const active = resolveDefaultActiveContext(grants, {
      organizationId: org,
      churchId: rf1,
    });
    assert.equal(active.churchId, rf2);
  });
});
