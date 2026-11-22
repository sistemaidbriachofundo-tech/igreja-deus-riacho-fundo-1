import { requiresStepUpMfa } from "./privileged-roles";
import type { AuthGrant } from "@idbrf/shared";
const grant = (roleCode: string) => [{ roleCode, organizationId: "org-qa", churchId: "church-qa", ministryId: null }] as AuthGrant[];
const qa = { IDBRF_RUNTIME_STAGE: "qa", F11_MFA_BLOCKING: "true", F11_QA_TESTER_PASSWORD_ONLY: "true" } as NodeJS.ProcessEnv;

describe("MFA QA restrito a testadores sintéticos não administradores", () => {
  it("libera os papéis fictícios apenas em QA isolada", () => {
    for (const role of ["PASTOR","SECRETARIA","LIDER_MINISTERIO","EDITOR_SITE","MEMBRO"]) {
      expect(requiresStepUpMfa(grant(role), false, qa, "qa.rf1.tester.pastora@example.test")).toBe(false);
    }
  });
  it("mantém MFA obrigatório para administradores e grants combinados", () => {
    expect(requiresStepUpMfa(grant("PLATFORM_ADMIN"), false, qa, "qa.rf1.tester.admin@example.test")).toBe(true);
    expect(requiresStepUpMfa([...grant("MEMBRO"), ...grant("PLATFORM_ADMIN")], false, qa, "qa.rf1.tester.editor@example.test")).toBe(true);
  });
  it("não dispensa fatores ativados nem contas não sintéticas", () => {
    expect(requiresStepUpMfa(grant("PASTOR"), true, qa, "qa.rf1.tester.pastora@example.test")).toBe(true);
    expect(requiresStepUpMfa(grant("SECRETARIA"), false, qa, "secretaria@igreja.org")).toBe(true);
    expect(requiresStepUpMfa(grant("SECRETARIA"), false, qa, "qa.pastor.riacho1@example.test")).toBe(true);
  });
  it("nunca cria isenção em produção, nem quando flag estiver ligada", () => {
    expect(requiresStepUpMfa(grant("PASTOR"), false, { ...qa, IDBRF_RUNTIME_STAGE: "production" }, "qa.rf1.tester.pastora@example.test")).toBe(true);
    expect(requiresStepUpMfa(grant("PASTOR"), false, { ...qa, F11_QA_TESTER_PASSWORD_ONLY: "false" }, "qa.rf1.tester.pastora@example.test")).toBe(true);
  });
});
