import { buildMembershipMap, membershipRegionId } from "./membership-map";

describe("Mapa da Membresia", () => {
  it.each([
    ["QS 12, Riacho Fundo I, Brasília/DF", 17],
    ["Rua exemplo - bairro Riacho Fundo 2 - DF", 21],
    ["Quadra de Exemplo, Guará II", 10],
    ["Quadra de Exemplo, Areal, Águas Claras, Brasília", 20],
    ["Quadra de Exemplo, Sudoeste/Octogonal", 22],
    ["Rua exemplo, Água Quente DF", 35],
    ["Rua Riacho Fundo I, Brasília", undefined],
    ["Riacho Fundo I, Riacho Fundo II, DF", undefined],
    ["Quadra de Exemplo, Gama, GO", undefined],
    ["Brasília, DF, 70000-000", undefined],
    [null, undefined],
  ])("classifica %s apenas com uma região identificável", (address, region) => {
    expect(membershipRegionId(address)).toBe(region);
  });

  it("entrega contagens por vínculo e agrupa regiões pequenas sem devolver endereços", () => {
    const row = (address: string | null, status = "ACTIVE") => ({ status, person: { address } });
    const report = buildMembershipMap([
      ...Array.from({ length: 6 }, (_, i) => row(`Quadra fictícia ${i}, Riacho Fundo I, DF`)),
      row("Rua de Exemplo, Guará II"), row("Areal"), row("QNL s/n"), row(null),
      row("Recanto das Emas", "PENDING_ADMISSION"),
      row("Riacho Fundo I", "INACTIVE"),
      row("Riacho Fundo I", "TRANSFERRED"),
    ]);

    expect(report.ACTIVE).toEqual({
      regions: [{ id: 17, name: "Riacho Fundo I", count: 6, latitude: expect.any(Number), longitude: expect.any(Number) }],
      pending: 2,
      grouped: 2,
    });
    expect(report.PENDING_ADMISSION).toEqual({ regions: [], pending: 0, grouped: 1 });
    expect(report.INACTIVE).toEqual({ regions: [], pending: 0, grouped: 1 });
    expect(JSON.stringify(report)).not.toMatch(/Quadra fictícia|Guará|Areal|TRANSFERRED/);
  });
});
