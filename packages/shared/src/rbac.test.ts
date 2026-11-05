import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLE_CODES, grantMatchesScope, hasAccess } from "./rbac";

describe("rbac helpers", () => {
  it("matches role with church-scoped grant", () => {
    const ok = grantMatchesScope(
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: "org1",
        churchId: "ch1",
      },
      {
        roleCodes: [ROLE_CODES.SECRETARIA],
        organizationId: "org1",
        churchId: "ch1",
      },
    );
    assert.equal(ok, true);
  });

  it("rejects church grant for another church", () => {
    const ok = grantMatchesScope(
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: "org1",
        churchId: "ch1",
      },
      {
        roleCodes: [ROLE_CODES.SECRETARIA],
        organizationId: "org1",
        churchId: "ch2",
      },
    );
    assert.equal(ok, false);
  });

  it("org-wide grant covers any church in that org", () => {
    const ok = grantMatchesScope(
      {
        roleCode: ROLE_CODES.PASTOR,
        organizationId: "org1",
        churchId: null,
      },
      {
        roleCodes: [ROLE_CODES.PASTOR],
        organizationId: "org1",
        churchId: "ch9",
      },
    );
    assert.equal(ok, true);
  });

  it("hasAccess is true when any grant matches", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.MEMBRO,
        organizationId: "org1",
        churchId: "ch1",
      },
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: "org1",
        churchId: "ch1",
      },
    ];
    assert.equal(
      hasAccess(grants, {
        roleCodes: [ROLE_CODES.SECRETARIA],
        organizationId: "org1",
        churchId: "ch1",
      }),
      true,
    );
    assert.equal(
      hasAccess(grants, {
        roleCodes: [ROLE_CODES.TESOURARIA],
        organizationId: "org1",
        churchId: "ch1",
      }),
      false,
    );
  });

  it("ministry-scoped grant matches church-wide and specific ministry", () => {
    const grant = {
      roleCode: ROLE_CODES.LIDER_MINISTERIO,
      organizationId: "org1",
      churchId: "ch1",
      ministryId: "m1",
    };
    assert.equal(
      grantMatchesScope(grant, {
        roleCodes: [ROLE_CODES.LIDER_MINISTERIO],
        organizationId: "org1",
        churchId: "ch1",
      }),
      true,
    );
    assert.equal(
      grantMatchesScope(grant, {
        roleCodes: [ROLE_CODES.LIDER_MINISTERIO],
        organizationId: "org1",
        churchId: "ch1",
        ministryId: "m1",
      }),
      true,
    );
    assert.equal(
      grantMatchesScope(grant, {
        roleCodes: [ROLE_CODES.LIDER_MINISTERIO],
        organizationId: "org1",
        churchId: "ch1",
        ministryId: "m2",
      }),
      false,
    );
  });
});
