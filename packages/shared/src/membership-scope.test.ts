import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROLE_CODES } from "./rbac";
import {
  canManageMemberships,
  canViewOwnCredential,
} from "./membership-scope";

describe("membership scope", () => {
  const org = "org-rf1";
  const church = "church-rf1";
  const otherChurch = "church-other";

  it("allows SECRETARIA in the same church", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: org,
        churchId: church,
      },
    ];
    assert.equal(
      canManageMemberships(grants, { organizationId: org, churchId: church }),
      true,
    );
  });

  it("denies SECRETARIA for another church", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: org,
        churchId: church,
      },
    ];
    assert.equal(
      canManageMemberships(grants, {
        organizationId: org,
        churchId: otherChurch,
      }),
      false,
    );
  });

  it("denies MEMBRO from managing memberships", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.MEMBRO,
        organizationId: org,
        churchId: church,
      },
    ];
    assert.equal(
      canManageMemberships(grants, { organizationId: org, churchId: church }),
      false,
    );
  });

  it("allows PLATFORM_ADMIN scoped to org/church", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.PLATFORM_ADMIN,
        organizationId: org,
        churchId: church,
      },
    ];
    assert.equal(
      canManageMemberships(grants, { organizationId: org, churchId: church }),
      true,
    );
  });

  it("own credential is person_id titularidade only", () => {
    assert.equal(canViewOwnCredential("p1", "p1"), true);
    assert.equal(canViewOwnCredential("p1", "p2"), false);
  });
});
