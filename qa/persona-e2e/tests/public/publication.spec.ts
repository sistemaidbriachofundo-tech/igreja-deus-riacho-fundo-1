import { expect, test } from "@playwright/test";
import { keep, finish, requireWeb, row } from "../../src/commit";
import type { MatrixRow } from "../../src/matrix";
import { classify, horizontalOverflow, navigationTiming, shot } from "../../src/surface";

const widths = [360, 768, 1440] as const;

test.describe("publicação sem API", () => {
  test("login desabilitado não envia credencial", async ({ page }, testInfo) => {
    const bucket: MatrixRow[] = [];
    if (!(await requireWeb(page, testInfo, "PUBLICACAO", "publicacao/servidor"))) return;
    const started = Date.now();
    await page.goto("/login/");
    const surface = await classify(page);
    const warning = page.getByText("O acesso autenticado ainda não está habilitado nesta publicação");
    const submit = page.getByRole("button", { name: "Entrar no painel" });
    const evidence = await shot(page, "public-login-1440");
    const paint = await navigationTiming(page);
    keep(row(
      "publicacao/login-desabilitado",
      "PUBLICACAO",
      "Login frio na publicação",
      surface.surface === "login-gate" && (await warning.count()) === 1 && (await submit.isDisabled())
        ? "PASS"
        : "FAIL",
      surface.surface === "login-gate"
        ? "O botão de entrar permanece desabilitado e a página avisa que nenhuma credencial será enviada."
        : `Superfície classificada como ${surface.surface}. Marcadores: ${surface.markers.join(", ") || "nenhum"}.`,
      { evidence, durationMs: paint ?? Date.now() - started },
    ), bucket);
    finish(bucket);
  });

  for (const route of ["/app/secretaria/", "/app/membros/", "/app/"]) {
    test(`${route} é gate de login, não módulo`, async ({ page }, testInfo) => {
      const bucket: MatrixRow[] = [];
      if (!(await requireWeb(page, testInfo, "PUBLICACAO", `publicacao/servidor${route}`))) return;
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      const surface = await classify(page);
      const slug = route.replaceAll("/", "") || "painel";
      const evidence = await shot(page, `public-${slug}-login-gate-1440`);
      const confused = surface.surface === "operational" || surface.markers.length > 0;
      const gate = surface.surface === "login-gate";
      keep(row(
        `publicacao/gate${route}`,
        "PUBLICACAO",
        `Rota ${route} sem sessão`,
        confused ? "FAIL" : gate ? "PASS" : "FAIL",
        confused
          ? `A rota exibiu marcadores operacionais (${surface.markers.join(", ")}). Isso seria um falso positivo de módulo.`
          : gate
            ? "A rota renderiza a tela de login. Esta evidência não aprova Secretaria, membros nem permissões."
            : `Superfície ${surface.surface} depois da espera. Marcadores: ${surface.markers.join(", ") || "nenhum"}.`,
        { evidence },
      ), bucket);
      finish(bucket);
    });
  }

  for (const width of widths) {
    test(`viewport ${width} na publicação`, async ({ page }, testInfo) => {
      const bucket: MatrixRow[] = [];
      if (!(await requireWeb(page, testInfo, "PUBLICACAO", `publicacao/viewport-servidor-${width}`))) return;
      await page.setViewportSize({ width, height: width === 360 ? 780 : 1000 });
      const started = Date.now();
      await page.goto("/login/");
      await page.goto("/app/secretaria/");
      const surface = await classify(page);
      const overflow = await horizontalOverflow(page);
      const evidence = await shot(page, `public-secretaria-gate-${width}`);
      const gateOk = surface.surface === "login-gate" && surface.markers.length === 0;
      const fits = overflow <= 4;
      keep(row(
        `publicacao/viewport-${width}`,
        "PUBLICACAO",
        `Layout ${width}px do gate em /app/secretaria/`,
        gateOk && fits ? "PASS" : "FAIL",
        gateOk
          ? fits
            ? `Gate de login sem overflow horizontal (${overflow}px). Medição da tela de acesso, não do módulo.`
            : `Gate de login com overflow horizontal de ${overflow}px.`
          : `Superfície ${surface.surface} no lugar do gate.`,
        { evidence, durationMs: Date.now() - started },
      ), bucket);
      expect(surface.surface, "o gate precisa existir antes de medir o módulo").toBe("login-gate");
      finish(bucket);
    });
  }
});
