import { qaTesterProvisionEnabled, QA_PRESETS } from "./church-access.controller";
describe("Ferramenta de contas fictícias do QA", () => {
  it("tem exatamente oito personas sintéticas, sem administrador", () => {
    expect(QA_PRESETS).toHaveLength(8);
    expect(QA_PRESETS.map(p => p.slug)).toEqual(["pastora","secretaria1","secretaria2","louvor","atmosfera","homens","mentor","midia"]);
    expect(QA_PRESETS.map(p => String(p.role))).not.toContain("PLATFORM_ADMIN");
  });
  it("funciona apenas com as três proteções explícitas", () => {
    const env = {IDBRF_RUNTIME_STAGE:"qa",F11_QA_TESTER_PASSWORD_ONLY:"true",ACCESS_INVITE_DELIVERY:"preview"} as NodeJS.ProcessEnv;
    expect(qaTesterProvisionEnabled(env)).toBe(true);
    expect(qaTesterProvisionEnabled({...env, IDBRF_RUNTIME_STAGE:"production"})).toBe(false);
    expect(qaTesterProvisionEnabled({...env, F11_QA_TESTER_PASSWORD_ONLY:"false"})).toBe(false);
    expect(qaTesterProvisionEnabled({...env, ACCESS_INVITE_DELIVERY:"smtp"})).toBe(false);
  });
});
