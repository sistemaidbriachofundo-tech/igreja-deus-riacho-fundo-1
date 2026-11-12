import { describe,expect,it } from "vitest";
import { personUnder18 } from "./new-person-intake-model";

describe("Maioridade em Brasília — cadastro de pessoas",()=>{
  it("exige responsável até o dia anterior ao aniversário de 18 anos",()=>{
    const now = new Date("2026-11-11T18:00:00.000Z");
    expect(personUnder18("2008-11-12",now)).toBe(true);
    expect(personUnder18("2008-11-11",now)).toBe(false);
  });
  it("não considera preenchimentos inválidos como idade comprovada",()=>{
    expect(personUnder18("2025-02-30")).toBe(false);
    expect(personUnder18("não sei")).toBe(false);
  });
});
