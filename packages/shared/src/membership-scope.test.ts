import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROLE_CODES } from "./rbac";
import {
  canAccessCredentialPdf,
  canAccessFinance,
  canManageChannels,
  canAdministerMinistries,
  canManageMemberships,
  canManageOidcConfig,
  canManageSpecificMinistry,
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

  it("LIDER só opera o ministry do grant", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.LIDER_MINISTERIO,
        organizationId: org,
        churchId: church,
        ministryId: "min-jovens",
      },
    ];
    assert.equal(
      canManageSpecificMinistry(grants, "p-lider", {
        organizationId: org,
        churchId: church,
        ministryId: "min-jovens",
      }),
      true,
    );
    assert.equal(
      canManageSpecificMinistry(grants, "p-lider", {
        organizationId: org,
        churchId: church,
        ministryId: "min-homens",
      }),
      false,
    );
    assert.equal(
      canAdministerMinistries(grants, { organizationId: org, churchId: church }),
      false,
    );
  });

  it("LIDER sem grant.ministryId só via leaderPersonId", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.LIDER_MINISTERIO,
        organizationId: org,
        churchId: church,
      },
    ];
    assert.equal(
      canManageSpecificMinistry(grants, "p-lider", {
        organizationId: org,
        churchId: church,
        ministryId: "min-jovens",
        leaderPersonId: "p-lider",
      }),
      true,
    );
    assert.equal(
      canManageSpecificMinistry(grants, "p-other", {
        organizationId: org,
        churchId: church,
        ministryId: "min-jovens",
        leaderPersonId: "p-lider",
      }),
      false,
    );
  });

  it("allows owner or secretaria to access credential PDF", () => {
    const secretaria = [
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: org,
        churchId: church,
      },
    ];
    assert.equal(
      canAccessCredentialPdf(secretaria, "p-sec", "p-mem", {
        organizationId: org,
        churchId: church,
      }),
      true,
    );
    assert.equal(
      canAccessCredentialPdf([], "p-mem", "p-mem", {
        organizationId: org,
        churchId: church,
      }),
      true,
    );
    assert.equal(
      canAccessCredentialPdf([], "p-other", "p-mem", {
        organizationId: org,
        churchId: church,
      }),
      false,
    );
  });

  it("restricts OIDC config to PLATFORM_ADMIN", () => {
    assert.equal(
      canManageOidcConfig(
        [
          {
            roleCode: ROLE_CODES.PLATFORM_ADMIN,
            organizationId: org,
            churchId: church,
          },
        ],
        { organizationId: org },
      ),
      true,
    );
    assert.equal(
      canManageOidcConfig(
        [
          {
            roleCode: ROLE_CODES.SECRETARIA,
            organizationId: org,
            churchId: church,
          },
        ],
        { organizationId: org },
      ),
      false,
    );
  });

  it("allows only TESOURARIA for finance", () => {
    assert.equal(
      canAccessFinance(
        [
          {
            roleCode: ROLE_CODES.TESOURARIA,
            organizationId: org,
            churchId: church,
          },
        ],
        { organizationId: org, churchId: church },
      ),
      true,
    );
    assert.equal(
      canAccessFinance(
        [
          {
            roleCode: ROLE_CODES.PLATFORM_ADMIN,
            organizationId: org,
            churchId: church,
          },
        ],
        { organizationId: org, churchId: church },
      ),
      false,
    );
    assert.equal(
      canAccessFinance(
        [
          {
            roleCode: ROLE_CODES.SECRETARIA,
            organizationId: org,
            churchId: church,
          },
        ],
        { organizationId: org, churchId: church },
      ),
      false,
    );
  });

  it("allows PASTOR/SECRETARIA to manage F5 channels", () => {
    assert.equal(
      canManageChannels(
        [
          {
            roleCode: ROLE_CODES.PASTOR,
            organizationId: org,
            churchId: church,
          },
        ],
        { organizationId: org, churchId: church },
      ),
      true,
    );
    assert.equal(
      canManageChannels(
        [
          {
            roleCode: ROLE_CODES.MEMBRO,
            organizationId: org,
            churchId: church,
          },
        ],
        { organizationId: org, churchId: church },
      ),
      false,
    );
  });
});