import { test } from "@playwright/test";
import { ACCOUNTS, apiBase, demoPassword, loginAccount } from "../../src/accounts";
import { keep, finish, requireWeb, row } from "../../src/commit";
import type { MatrixRow } from "../../src/matrix";
import { classify, isReachable, navigationTiming, shot } from "../../src/surface";

test.describe("login frio e quente", () => {
  for (const account of ACCOUNTS) {
    test(`${account.persona} entra e reutiliza a sessão`, async ({ page }, testInfo) => {
      const bucket: MatrixRow[] = [];
      if (!(await requireWeb(page, testInfo, account.persona, `${account.persona}/servidor-web`))) return;
      const apiUp = await isReachable(page.request, `${apiBase()}/health`);
      if (!apiUp) {
        keep(row(
          `${account.persona}/api`,
          account.persona,
          "API de homologação",
          "BLOCKED",
          "GET /health não respondeu. Login autenticado depende da API local com seed sintético.",
        ), bucket);
        finish(bucket);
        return;
      }
      if (!account.seeded) {
        const probe = await loginAccount(page.request, account);
        keep(row(
          "EDITOR/conta-sintetica",
          "EDITOR",
          "Login da persona Editor",
          "BLOCKED",
          probe.status === 200 || probe.status === 201
            ? "A API autenticou editor.demo@example.test, mas o seed versionado não documenta essa conta. A jornada fica bloqueada até o contrato de identidade confirmar o papel EDITOR_SITE."
            : `O catálogo tem o papel EDITOR_SITE, porém não há usuário sintético no seed (login HTTP ${probe.status}). Dependência da frente de RBAC/identidade. Nenhuma senha ou token foi registrado.`,
        ), bucket);
        finish(bucket);
        return;
      }

      await page.goto("/login/");
      const before = await classify(page);
      await page.locator("#church-email").fill(account.email);
      await page.locator("#church-password").fill(demoPassword());
      const submit = page.getByRole("button", { name: "Entrar no painel" });
      const started = Date.now();
      let coldOk = false;
      let coldDetail = "";
      if (await submit.isDisabled()) {
        coldDetail = "O botão de entrar está desabilitado nesta publicação. Nenhuma credencial foi enviada.";
      } else {
        await submit.click();
        try {
          await page.waitForURL(/\/app\//, { timeout: 20_000 });
          await page.waitForTimeout(400);
          const backToLogin = /\/login\/?$/.test(new URL(page.url()).pathname);
          const surface = await classify(page);
          coldOk = !backToLogin && surface.surface === "operational" && before.surface === "login-gate";
          coldDetail = coldOk
            ? `Saiu do gate e abriu superfície operacional em ${new URL(page.url()).pathname}.`
            : `Destino ${new URL(page.url()).pathname} classificado como ${surface.surface}. Marcadores: ${surface.markers.join(", ") || "nenhum"}.`;
        } catch {
          const alert = await page.getByRole("alert").innerText().catch(() => "");
          coldDetail = alert || "O formulário não deixou a tela de login.";
        }
      }
      const coldMs = Date.now() - started;
      const coldShot = account.persona === "SECRETARIA" ? await shot(page, "hml-painel-apos-login-frio") : undefined;
      keep(row(
        `${account.persona}/login-frio`,
        account.persona,
        "Login frio",
        coldOk ? "PASS" : "FAIL",
        coldDetail,
        { durationMs: coldMs, evidence: coldShot },
      ), bucket);

      if (coldOk) {
        const hotStarted = Date.now();
        await page.goto("/login/");
        let hotOk = false;
        let hotDetail = "";
        try {
          await page.waitForURL(/\/app\//, { timeout: 15_000 });
          const surface = await classify(page);
          hotOk = surface.surface === "operational";
          hotDetail = hotOk
            ? "A sessão já armazenada abriu o painel sem novo envio de senha."
            : `Reentrada caiu em ${surface.surface}.`;
        } catch {
          hotDetail = "A sessão armazenada não redirecionou para o painel.";
        }
        const paint = await navigationTiming(page);
        keep(row(
          `${account.persona}/login-quente`,
          account.persona,
          "Login quente",
          hotOk ? "PASS" : "FAIL",
          hotDetail,
          { durationMs: paint ?? Date.now() - hotStarted },
        ), bucket);
      } else {
        keep(row(
          `${account.persona}/login-quente`,
          account.persona,
          "Login quente",
          "BLOCKED",
          "Não houve sessão válida após o login frio.",
        ), bucket);
      }
      finish(bucket);
    });
  }
});
