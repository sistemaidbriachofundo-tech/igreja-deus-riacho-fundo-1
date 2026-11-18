const SHA = "935fd53e8187b840084a845e418dcb06cbd13956";

export function classifyAlias(probe) {
  const location = probe.location ?? "";
  const sso = probe.status === 302 && location.startsWith("https://vercel.com/sso-api");
  const paused = probe.status === 503 || /DEPLOYMENT_PAUSED|DEPLOYMENT_BLOCKED/.test(probe.body ?? "");
  if (sso) {
    return {
      result: "BLOCKED",
      kind: "acesso",
      detail: "O alias respondeu 302 para o login da Vercel. A aplicação não foi exibida. Isso não é falha de produto.",
    };
  }
  if (paused) {
    return {
      result: "BLOCKED",
      kind: "deploy",
      detail: "O alias não está servindo a aplicação.",
    };
  }
  if (probe.status === 200 && probe.bodyIncludesApp) {
    return {
      result: "OBSERVED",
      kind: "preview",
      detail: "O HTML da aplicação chegou. A jornada ainda precisa ser percorrida.",
    };
  }
  return {
    result: "BLOCKED",
    kind: "acesso",
    detail: `Resposta ${probe.status} sem HTML da aplicação.`,
  };
}

export function classifyDeploymentRead(api) {
  if (api.missingToken || api.status === 403) {
    return {
      result: "BLOCKED",
      kind: "acesso",
      detail: "readyState não foi lido. A API da Vercel pediu token. Não desproteger o SSO para obter essa leitura.",
    };
  }
  if (api.readyState === "READY") {
    return {
      result: "READY_ONLY",
      kind: "deploy",
      detail: "READY não comprova jornada. A tela ainda precisa ser exercida.",
    };
  }
  return {
    result: "BLOCKED",
    kind: "deploy",
    detail: `readyState ${api.readyState ?? "ausente"}.`,
  };
}

export function assertNoAccessMarkedAsProductFailure(rows) {
  return rows.filter(row => row.access && row.result === "FAIL");
}

export function counts(rows) {
  return rows.reduce((acc, row) => {
    acc[row.result] = (acc[row.result] ?? 0) + 1;
    return acc;
  }, { PASS: 0, FAIL: 0, BLOCKED: 0 });
}

export { SHA };
