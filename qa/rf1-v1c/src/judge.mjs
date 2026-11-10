export const BASELINE = "6c43aea96ad3fe24ec1ed2c09f717963fb289c62";

export const PRIOR_QA = {
  issue: 153,
  executedAt: "2026-11-10T01:56:27.788Z",
  pagesSha: "3c7375c23b7a4ed4d5e18618f34ec80d7fd43ac3",
  pass: 15,
  fail: 6,
  blocked: 29,
};

const SEEDED = [
  ["ADMIN", "platform.demo@example.test"],
  ["SECRETARIA", "ana.demo@example.test"],
  ["PASTOR", "pastor.demo@example.test"],
  ["TESOURARIA", "tesouraria.demo@example.test"],
  ["LIDER", "lider.jovens.demo@example.test"],
  ["MEMBRO", "bruno.demo@example.test"],
  ["EDITOR", "editor.demo@example.test"],
];

function row(partial) {
  return {
    needsSession: false,
    origin: "baseline 6c43aea publicada",
    ...partial,
  };
}

function sessionBlocked(id, window, priority, item, cause) {
  return row({
    id,
    window,
    priority,
    item,
    result: "BLOCKED",
    needsSession: true,
    cause,
    criterion: "PASS somente com a tela autenticada exercitada. Sem sessão, o resultado não vira PASS.",
    evidence: "Login sintético não abriu sessão. Senha não impressa e não resetada.",
  });
}

export function judge(obs) {
  const pages = obs.pages ?? {};
  const home = pages.home ?? {};
  const login = pages.login ?? {};
  const studio = pages["w1-estudio"] ?? {};
  const design = pages["design-system"] ?? {};
  const status = pages.status ?? {};
  const editorial = pages["app/editorial"] ?? {};
  const operation = pages["app/operacao"] ?? {};
  const flags = obs.source?.flags ?? {};
  const auth = obs.authenticated;
  const rows = [];

  rows.push(row({
    id: "RF1-SHA",
    window: "—",
    priority: "P0",
    item: "O Pages oficial desta rodada é o SHA 6c43aea.",
    result: obs.pagesSha === BASELINE ? "PASS" : "FAIL",
    cause: obs.pagesSha === BASELINE
      ? "release.json do Pages declara o SHA da baseline."
      : "O release.json publicado não é a baseline pedida.",
    criterion: `sourceSha igual a ${BASELINE}.`,
    evidence: `Pages sourceSha=${obs.pagesSha ?? "ausente"}.`,
  }));

  const apiSame = obs.apiSha === BASELINE;
  rows.push(row({
    id: "RF1-API-SHA",
    window: "—",
    priority: "P1",
    item: "A API HML identifica o mesmo commit do Pages.",
    result: obs.apiHealth !== 200 ? "BLOCKED" : apiSame ? "PASS" : "FAIL",
    cause: obs.apiHealth !== 200
      ? "GET /health não respondeu 200."
      : apiSame
        ? "GET /meta devolve o mesmo sourceSha."
        : "O sourceSha da API difere do Pages ou veio vazio.",
    criterion: "GET /health 200 e sourceSha da API igual ao Pages.",
    evidence: `health=${obs.apiHealth ?? "sem resposta"}; apiSha=${obs.apiSha ?? "null"}.`,
  }));

  const previewReady = obs.preview?.status === 200 && !/PAUSED|BLOCKED|unavailable/i.test(obs.preview?.marker ?? "");
  rows.push(row({
    id: "RF1-PREVIEW",
    window: "—",
    priority: "P0",
    item: "Prévia real do projeto id-riacho1-web-hml disponível para regressão.",
    result: previewReady ? "PASS" : "BLOCKED",
    origin: "diretriz #144 e alias id-riacho1-web-hml",
    cause: previewReady
      ? "O alias da prévia respondeu conteúdo utilizável."
      : "O alias não está READY. A regressão visual desta rodada usa o Pages oficial do mesmo SHA.",
    criterion: "HTTP 200 sem DEPLOYMENT_PAUSED, DEPLOYMENT_BLOCKED ou indisponibilidade.",
    evidence: `GET ${obs.preview?.url ?? "https://id-riacho1-web-hml.vercel.app/"} → ${obs.preview?.status ?? "sem resposta"} ${obs.preview?.marker ?? ""}`.trim(),
  }));

  const nav = home.navHrefs ?? [];
  const separateDocs = nav.some((href) => href.includes("/a-igreja")) && nav.some((href) => href.includes("/eventos"));
  const anchorOnly = nav.some((href) => href.includes("#quem-somos")) && nav.some((href) => href.includes("#agenda")) && !separateDocs;
  rows.push(row({
    id: "RF1-HOME-PAGINA",
    window: "00:13–01:27",
    priority: "P0",
    item: "Início, Quem somos e Agenda numa página só, com âncoras. Login fica à parte.",
    result: home.http !== 200 ? "BLOCKED" : anchorOnly ? "PASS" : "FAIL",
    origin: "áudio 00:13–01:27 e menu público",
    cause: home.http !== 200
      ? "A home oficial não abriu."
      : anchorOnly
        ? "O menu usa âncoras da mesma página."
        : "A home tem seções, mas o menu abre documentos separados.",
    criterion: "O menu público aponta para âncoras de uma única página e o login permanece em /login/.",
    evidence: `HTTP ${home.http ?? "?"}. Menu: ${(nav.join(", ") || "vazio")}. Âncoras na home: quem-somos=${Boolean(home.hasQuemSomosAnchor)} agenda=${Boolean(home.hasAgendaAnchor)}.`,
  }));

  rows.push(row({
    id: "RF1-HOME-IA",
    window: "00:13–01:27",
    priority: "P0",
    item: "Remover a IA pública e o código morto desse assistente. Preservar o assistente interno.",
    result: home.riachinho || pages["a-igreja"]?.riachinho || pages.eventos?.riachinho ? "FAIL" : home.http === 200 ? "PASS" : "BLOCKED",
    origin: "PublicPortal + flag de main no CI",
    cause: home.riachinho
      ? "O lançador do Riachinho está no DOM do Pages oficial."
      : "O lançador não apareceu nas três superfícies do roteiro.",
    criterion: "Home, Quem somos e Agenda sem lançador nem painel do Riachinho.",
    evidence: `home=${Boolean(home.riachinho)} a-igreja=${Boolean(pages["a-igreja"]?.riachinho)} agenda=${Boolean(pages.eventos?.riachinho)}. Flag de main no CI=${Boolean(flags.publicAiEnabledOnMain)}. Componente ainda importado=${Boolean(flags.publicAiMounted)}.`,
  }));

  const extra = ["ministerios", "novidades", "visita", "contato", "w1-estudio", "design-system"]
    .filter((key) => pages[key]?.http === 200);
  rows.push(row({
    id: "RF1-HOME-EXTRA",
    window: "00:13–01:27",
    priority: "P1",
    item: "O site público do piloto não publica superfícies fora de Início, Quem somos, Agenda e login.",
    result: extra.length === 0 ? "PASS" : "FAIL",
    cause: extra.length === 0
      ? "As rotas extras não responderam 200."
      : "Há rotas públicas 200 além do roteiro.",
    criterion: "Somente a página única e o login respondem como superfície pública do piloto.",
    evidence: extra.length ? extra.map((key) => `${key} HTTP ${pages[key].http}`).join("; ") : "Nenhuma rota extra em 200.",
  }));

  const contrast = home.worstContrast;
  rows.push(row({
    id: "RF1-HOME-CONTRASTE",
    window: "00:13–01:27",
    priority: "P1",
    item: "Contraste do texto comum na home pelo menos 4,5:1.",
    result: contrast == null ? "BLOCKED" : contrast.ratio < contrast.minimum ? "FAIL" : "PASS",
    cause: contrast == null
      ? "Não houve amostra de texto com fundo opaco."
      : contrast.ratio < contrast.minimum
        ? "A pior amostra ficou abaixo do mínimo WCAG para o tamanho lido."
        : "As amostras coletadas passaram do mínimo.",
    criterion: "Texto comum ≥ 4,5:1; texto grande ≥ 3:1.",
    evidence: contrast
      ? `${contrast.ratio.toFixed(2)}:1 (mínimo ${contrast.minimum}) em “${contrast.text}”.`
      : "Sem amostra.",
  }));

  const overflow = home.overflow ?? [];
  const touch = obs.touch ?? [];
  rows.push(row({
    id: "RF1-TOQUE",
    window: "00:13–01:27",
    priority: "P2",
    item: "Alvos de toque com pelo menos 44 px.",
    result: obs.touchMeasured ? (touch.length ? "FAIL" : "PASS") : "BLOCKED",
    cause: !obs.touchMeasured
      ? "A amostra de botões não foi coletada."
      : touch.length
        ? "Há botão visível abaixo de 44 px."
        : "Os botões medidos passaram de 44 px.",
    criterion: "Botões e links visíveis com altura ou largura útil abaixo de 44 px são falha.",
    evidence: touch.length
      ? touch.map((item) => `${item.name || "controle"} ${item.w}×${item.h} em ${item.where}`).join("; ")
      : obs.touchMeasured ? "Nenhum alvo abaixo de 44 px na amostra." : "Amostra não coletada.",
  }));
  rows.push(row({
    id: "RF1-HOME-SCROLL",
    window: "00:13–01:27",
    priority: "P1",
    item: "Home sem rolagem horizontal em 320, 390, 768 e 1440.",
    result: home.http !== 200 ? "BLOCKED" : overflow.length ? "FAIL" : "PASS",
    cause: overflow.length ? "A largura do documento passou da largura da janela." : "scrollWidth permaneceu dentro da janela.",
    criterion: "scrollWidth ≤ clientWidth + 1 px nas quatro larguras.",
    evidence: overflow.length ? overflow.map((item) => `${item.width}px (${item.scrollWidth}>${item.clientWidth})`).join("; ") : "Sem excesso nas larguras medidas.",
  }));

  const loginReady = login.http === 200 && login.hasEmail && login.hasPassword;
  rows.push(row({
    id: "RF1-LOGIN-ESTRUTURA",
    window: "01:40–02:06",
    priority: "P1",
    item: "A tela de login aprovada continua no ar, com e-mail e senha.",
    result: login.http !== 200 ? "BLOCKED" : loginReady ? "PASS" : "FAIL",
    cause: loginReady ? "O formulário publicado tem e-mail e senha." : "O formulário esperado não estava completo.",
    criterion: "HTTP 200, campo de e-mail e campo de senha visíveis.",
    evidence: `HTTP ${login.http ?? "?"}; e-mail=${Boolean(login.hasEmail)}; senha=${Boolean(login.hasPassword)}; título=${login.title ?? ""}.`,
  }));

  rows.push(row({
    id: "RF1-LOGIN-TEXTO",
    window: "01:40–02:06",
    priority: "P0",
    item: "Remover somente o texto “Seu acesso é individual”.",
    result: login.http !== 200 ? "BLOCKED" : login.individualAccess ? "FAIL" : "PASS",
    origin: "LoginScreen.tsx e DOM de /login/",
    cause: login.individualAccess
      ? "A frase continua visível na tela publicada."
      : "A frase não apareceu no texto da tela.",
    criterion: "O texto visível de /login/ não contém “Seu acesso é individual”.",
    evidence: `DOM=${Boolean(login.individualAccess)}; fonte=${Boolean(flags.individualAccessCopy)}.`,
  }));

  rows.push(row({
    id: "RF1-LOGIN-ECO",
    window: "01:40–02:06",
    priority: "P1",
    item: "Erro de credencial não devolve a senha.",
    result: login.echo == null || login.loginHttp == null ? "BLOCKED" : login.echo ? "FAIL" : "PASS",
    cause: login.echo == null
      ? "O formulário não chegou a mostrar o alerta."
      : login.echo
        ? "O alerta continha a senha digitada."
        : "O alerta não contém a senha. A senha não entra no relatório.",
    criterion: "O alerta visível depois de uma tentativa não inclui a senha.",
    evidence: login.echo == null
      ? "Sem alerta."
      : `eco=${login.echo}; httpDoLogin=${login.loginHttp ?? "?"}; alerta=${login.alertExcerpt ?? ""}.`,
  }));

  if (!auth) {
    rows.push(sessionBlocked(
      "RF1-LOGIN-SAIDA",
      "01:40–02:06",
      "P1",
      "Sair encerra a sessão e volta ao destino aprovado.",
      "A fala não nomeia a tela de destino e a sessão não abriu para clicar em Sair.",
    ));
  } else {
    const backToLogin = (auth.logoutPath ?? "").includes("/login");
    rows.push(row({
      id: "RF1-LOGIN-SAIDA",
      window: "01:40–02:06",
      priority: "P1",
      needsSession: true,
      item: "Sair encerra a sessão e volta ao destino aprovado.",
      result: backToLogin ? "PASS" : "FAIL",
      cause: backToLogin
        ? "O clique em Sair levou a /login/ e removeu o token da sessão do navegador."
        : "O destino depois de Sair não foi a tela de login.",
      criterion: "Um controle Sair limpa a sessão e abre /login/.",
      evidence: `destino=${auth.logoutPath ?? "não observado"}; tokenRemovido=${Boolean(auth.tokenCleared)}.`,
    }));
  }

  const anonymousShell = pages.status ?? {};
  if (!auth) {
    rows.push(sessionBlocked("RF1-ADM-VISUAL", "02:06–03:23", "P0", "Dashboard administrativo sem cartão de QA, jargão, duplicação ou texto de planejamento.", "PersonaHome só renderiza a mesa com sessão. Não houve captura autenticada."));
    rows.push(sessionBlocked("RF1-ADM-LENTIDAO", "02:06–03:23", "P1", "A lentidão perceptível do painel administrativo.", "O tempo do painel autenticado não foi medido."));
    rows.push(row({
      id: "RF1-ADM-BARRA",
      window: "02:06–03:23",
      priority: "P1",
      item: "Barra com perfil, busca, avisos e uma única ação Sair.",
      result: (anonymousShell.logoutButtons ?? 0) > 1 ? "FAIL" : "BLOCKED",
      cause: (anonymousShell.logoutButtons ?? 0) > 1
        ? "O shell publicado mostra mais de um botão Sair antes mesmo da sessão confirmada."
        : "A barra do shell autenticado não foi renderizada.",
      criterion: "Há busca, há avisos e há um único controle Sair.",
      evidence: (anonymousShell.logoutButtons ?? 0) > 1
        ? `/status/ exibiu ${anonymousShell.logoutButtons} botões Sair. Busca=${Boolean(anonymousShell.search)}. Avisos=${Boolean(anonymousShell.alerts)}. Captura qa/rf1-v1c/evidence/status-1440.jpg.`
        : "Login sintético não abriu sessão. Senha não impressa e não resetada.",
    }));
    rows.push(sessionBlocked("RF1-PES-FICHA", "03:23–04:38", "P0", "Ficha editável, persistente e localizável, distinta da secretaria.", "Não houve leitura nem recarga da ficha. Nenhum dado foi alterado."));
  } else {
    const jargon = auth.jargon ?? [];
    rows.push(row({
      id: "RF1-ADM-VISUAL",
      window: "02:06–03:23",
      priority: "P0",
      needsSession: true,
      item: "Dashboard administrativo sem cartão de QA, jargão, duplicação ou texto de planejamento.",
      result: jargon.length ? "FAIL" : "PASS",
      cause: jargon.length ? "O painel autenticado ainda mostra termos fora da linguagem do produto." : "A amostra autenticada não mostrou esses termos.",
      criterion: "Texto visível de /app/ sem QA, demo, endpoint, schema, RFC, 501 ou Church OS.",
      evidence: jargon.length ? jargon.join("; ") : `Captura ${auth.shots?.app ?? "qa/rf1-v1c/evidence/app-autenticado-1440.jpg"}.`,
    }));
    const load = auth.appLoadMs;
    rows.push(row({
      id: "RF1-ADM-LENTIDAO",
      window: "02:06–03:23",
      priority: "P1",
      needsSession: true,
      item: "A lentidão perceptível do painel administrativo.",
      result: load == null ? "BLOCKED" : load > 3000 ? "FAIL" : "PASS",
      cause: load == null ? "Sem Navigation Timing." : load > 3000 ? "O load da amostra passou de 3 s." : "Nesta amostra o load ficou dentro de 3 s.",
      criterion: "loadEventEnd da navegação autenticada de /app/ até 3000 ms.",
      evidence: load == null ? "Sem medida." : `load=${Math.round(load)} ms; ttfb=${auth.appTtfbMs == null ? "?" : Math.round(auth.appTtfbMs)} ms.`,
    }));
    rows.push(row({
      id: "RF1-ADM-BARRA",
      window: "02:06–03:23",
      priority: "P1",
      needsSession: true,
      item: "Barra com perfil, busca, avisos e uma única ação Sair.",
      result: auth.search && auth.alerts && auth.logoutCount === 1 ? "PASS" : "FAIL",
      cause: "A barra foi lida no shell autenticado.",
      criterion: "Há busca, há avisos e há um único controle Sair no menu.",
      evidence: `busca=${Boolean(auth.search)}; avisos=${Boolean(auth.alerts)}; controlesSair=${auth.logoutCount ?? 0}.`,
    }));
    rows.push(row({
      id: "RF1-PES-FICHA",
      window: "03:23–04:38",
      priority: "P0",
      needsSession: true,
      item: "Ficha editável, persistente e localizável, distinta da secretaria.",
      result: "BLOCKED",
      cause: "A lista pôde ser aberta, mas esta frente não grava nem recarrega ficha no HML.",
      criterion: "Editar um campo sintético, recarregar e reler o mesmo personId, com rollback combinado.",
      evidence: `membros HTTP interno observado=${Boolean(auth.sawMembers)}; secretaria distinta na navegação=${Boolean(auth.sawSecretary)}. Persistência não executada.`,
    }));
  }

  const ctaText = auth?.secretaryText ?? "";
  const ctaPass = ctaText.includes("Cadastrar pessoa") && /Iniciar admissão(?! sintética)/.test(ctaText);
  const ctaFailKnown = flags.hmlCombinedCta && !flags.hmlSeparateCtas;
  rows.push(row({
    id: "RF1-PES-CTA",
    window: "03:23–04:38",
    priority: "P0",
    needsSession: true,
    item: "Secretaria com ações separadas “Cadastrar pessoa” e “Iniciar admissão”.",
    result: auth && ctaPass ? "PASS" : ctaFailKnown || (auth && !ctaPass) ? "FAIL" : "BLOCKED",
    origin: "HmlPhaseOne, ramo montado quando NEXT_PUBLIC_HML_ENABLED=true",
    cause: auth && ctaPass
      ? "A secretaria autenticada mostrou as duas ações."
      : ctaFailKnown
        ? "O componente montado no build oficial junta as duas ações num botão só."
        : "Não foi possível ler o texto da secretaria.",
    criterion: "Dois controles visíveis, com esses rótulos, e a ficha não é uma segunda cópia da mesma lista.",
    evidence: auth
      ? `Texto observado contém o botão combinado=${ctaText.includes("Cadastrar e iniciar admissão")}.`
      : "Fonte: HmlPhaseOne usa “Cadastrar e iniciar admissão”. ChurchSecretary tem os rótulos separados, mas é o ramo descartado no build de main.",
  }));

  if (!auth) {
    rows.push(sessionBlocked("RF1-CRD-ABRIR", "04:38–05:10", "P0", "Abrir credencial com frente, verso, QR, PDF e revogação.", "A rota caiu no gate de login. Nenhum PDF foi baixado e nenhuma credencial foi revogada."));
    rows.push(sessionBlocked("RF1-CRD-409", "04:38–05:10", "P1", "O 409 ambíguo deixa de ser uma resposta única para conflitos diferentes.", "Não houve reprodução autenticada de um 409."));
    rows.push(sessionBlocked("RF1-MIN-CONTEXTO", "05:10–06:26", "P0", "Cada ministério abre o próprio contexto, integrantes, famílias, escalas e caixa quando permitido.", "O catálogo autenticado não foi percorrido."));
  } else {
    rows.push(row({
      id: "RF1-CRD-ABRIR",
      window: "04:38–05:10",
      priority: "P0",
      needsSession: true,
      item: "Abrir credencial com frente, verso, QR, PDF e revogação.",
      result: auth.credential?.front && auth.credential?.back && auth.credential?.qr ? "BLOCKED" : "BLOCKED",
      cause: "A leitura visual não executa emissão, download de PDF nem revogação. Esses passos alterariam o HML.",
      criterion: "Abrir frente e verso, baixar o PDF real, revogar e ver o QR inválido, só com rollback.",
      evidence: `frente=${Boolean(auth.credential?.front)}; verso=${Boolean(auth.credential?.back)}; qr=${Boolean(auth.credential?.qr)}; pdf baixado=não; revogação=não executada.`,
    }));
    rows.push(row({
      id: "RF1-CRD-409",
      window: "04:38–05:10",
      priority: "P1",
      needsSession: true,
      item: "O 409 ambíguo deixa de ser uma resposta única para conflitos diferentes.",
      result: "BLOCKED",
      cause: "Nenhum POST de conflito foi enviado. A fonte ainda traduz qualquer 409 para a mesma frase.",
      criterion: "Dois conflitos diferentes mostram causas diferentes, sem o número cru.",
      evidence: `mapper único na fonte=${Boolean(flags.collapsed409)}.`,
    }));
    rows.push(row({
      id: "RF1-MIN-CONTEXTO",
      window: "05:10–06:26",
      priority: "P0",
      needsSession: true,
      item: "Cada ministério abre o próprio contexto, integrantes, famílias, escalas e caixa quando permitido.",
      result: auth.ministryLabels?.length ? "BLOCKED" : "BLOCKED",
      cause: "O submenu pode ser lido, mas a jornada de integrantes, famílias, escalas e caixa não foi fechada sem gravação.",
      criterion: "Abrir Homens, Mulheres, Adolescentes, Atmosfera e Louvor a partir do menu e ver só o contexto daquele ministério.",
      evidence: `rótulos no submenu: ${(auth.ministryLabels ?? []).join(", ") || "nenhum"}.`,
    }));
  }

  const operationTitle = operation.title ?? "";
  const menuHasOperation = auth ? (auth.menuLabels ?? []).some((label) => /ministérios e operação/i.test(label)) : flags.operationLabel;
  rows.push(row({
    id: "RF1-MIN-SUPERFICIE",
    window: "05:10–06:26",
    priority: "P0",
    item: "Eliminar a superfície genérica “Ministérios e operação”.",
    result: menuHasOperation || /DAS|Operação integrada/i.test(operationTitle) ? "FAIL" : operation.http ? "PASS" : "BLOCKED",
    origin: "persona-navigation.ts e /app/operacao/",
    cause: "O rótulo ou o título DAS continuam no código publicado.",
    criterion: "Não existe item “Ministérios e operação” nem página de fases F2–F6 no menu.",
    evidence: `título do documento=${operationTitle || "não lido"}; rótulo na fonte=${Boolean(flags.operationLabel)}; fases no DasOperations=${Boolean(flags.dasPhases)}; menu autenticado=${auth ? "lido" : "não aberto"}.`,
  }));

  const meuInAdmin = auth ? Boolean(auth.meuEspacoInAdminMenu) : Boolean(flags.meuEspacoInAdminMenu);
  rows.push(row({
    id: "RF1-MBR-MENU",
    window: "06:26–06:45",
    priority: "P0",
    item: "A visão do membro fica fora do menu administrativo. “Meu Espaço” não aparece para a administração.",
    result: meuInAdmin ? "FAIL" : auth ? "PASS" : "BLOCKED",
    origin: "OWN_ASSIGNMENT inclui PLATFORM_ADMIN, SECRETARIA, PASTOR e LIDER",
    cause: meuInAdmin
      ? "Meu Espaço entra no menu de quem administra, não só no menu do membro."
      : "O menu administrativo lido não mostrou Meu Espaço.",
    criterion: "Conta administrativa sem o item Meu Espaço. Conta de membro sem os módulos de secretaria, tesouraria e gestão.",
    evidence: auth
      ? `menu=${(auth.menuLabels ?? []).join(", ")}.`
      : "Fonte: a área meu-espaco usa OWN_ASSIGNMENT, que inclui os papéis administrativos. Captura do menu não existe nesta rodada.",
  }));

  rows.push(row({
    id: "RF1-EDI-SIMULADO",
    window: "06:45–07:22",
    priority: "P0",
    item: "O editor simulado não fica publicado no site oficial.",
    result: studio.http === 200 && (studio.simulated || flags.simulatedRole) ? "FAIL" : studio.http === 404 ? "PASS" : studio.http ? "FAIL" : "BLOCKED",
    origin: "/w1-estudio/ e W1PortalStudio",
    cause: studio.simulated
      ? "A página pública mostra papel simulado."
      : "A rota não exibiu o estúdio simulado.",
    criterion: "/w1-estudio/ não responde 200 com “Papel simulado” ou “Publicar simulado”.",
    evidence: `HTTP ${studio.http ?? "?"}; papelSimulado=${Boolean(studio.simulated)}; título=${studio.title ?? ""}.`,
  }));

  const technical = [
    design.http === 200 ? "design-system HTTP 200, kit visual público" : null,
    status.engineering ? "checklist de engenharia visível em /status/" : null,
    /Church OS/i.test(editorial.title ?? "") ? "título do documento em /app/editorial/ contém Church OS" : null,
  ].filter(Boolean);
  rows.push(row({
    id: "RF1-EDI-TECNICO",
    window: "06:45–07:22",
    priority: "P0",
    item: "Tirar da interface comum ferramentas técnicas, fases, RFC, QA, endpoints e detalhe de implementação.",
    result: technical.length ? "FAIL" : "PASS",
    origin: "/design-system/, /status/ e título de /app/editorial/",
    cause: technical.length ? "Ainda há superfície técnica no host oficial." : "Essas marcas não apareceram.",
    criterion: "Sem vitrine de design system, sem página de bootstrap e sem Church OS no título.",
    evidence: technical.join("; ") || "Nenhuma marca técnica nas três superfícies.",
  }));

  rows.push(row({
    id: "RF1-EDI-INTERNO",
    window: "06:45–07:22",
    priority: "P1",
    item: "O assistente interno autorizado permanece no editor do site.",
    result: flags.internalAssistant ? "PASS" : "FAIL",
    origin: "SiteManager.tsx",
    cause: flags.internalAssistant
      ? "ViviEditorialAssistant continua ligado à gestão do site, separado do chat público."
      : "O editor do site não referencia mais o assistente interno.",
    criterion: "SiteManager importa o assistente editorial e o chat público é outro componente.",
    evidence: `import interno=${Boolean(flags.internalAssistant)}; chat público=${Boolean(flags.publicAiMounted)}.`,
  }));

  const logins = new Map((obs.logins ?? []).map((item) => [item.email, item]));
  const seededResults = SEEDED.map(([persona, email]) => logins.get(email) ?? { persona, email, http: "não tentado", opened: false });
  const opened = seededResults.filter((item) => item.opened);
  rows.push(row({
    id: "RF1-AUTH",
    window: "01:40–02:06",
    priority: "P0",
    needsSession: true,
    item: "Personas sintéticas autenticam na API HML.",
    result: opened.length === SEEDED.length ? "PASS" : "BLOCKED",
    cause: opened.length === 0
      ? "Nenhuma conta do seed versionado abriu sessão. O segredo HML não está neste agente e a senha não foi resetada."
      : opened.length === SEEDED.length
        ? "As sete contas do seed versionado autenticaram."
        : "O conjunto ficou incompleto. Não há PASS parcial nem 8/8.",
    criterion: "Uma tentativa por conta do seed versionado. PASS só com as sete abertas. PUBLICADOR_SITE não é tentado: não está nesse seed.",
    evidence: `${seededResults.map((item) => `${item.persona} ${item.opened ? "abriu" : "não abriu"} HTTP ${item.http}`).join("; ")}. PUBLICADOR_SITE sem tentativa.`,
  }));

  const anon = obs.anonymous ?? [];
  const anonOk = anon.length > 0 && anon.every((item) => item.http === 401);
  rows.push(row({
    id: "RF1-401",
    window: "—",
    priority: "P1",
    item: "Rotas protegidas sem sessão respondem 401.",
    result: anon.length === 0 ? "BLOCKED" : anonOk ? "PASS" : "FAIL",
    cause: anonOk ? "Os GET anônimos amostrados responderam 401." : "Algum GET protegido não respondeu 401.",
    criterion: "GET anônimo de /auth/me, /persons/search, /credentials/me e /ledger/accounts responde 401.",
    evidence: anon.map((item) => `${item.path} ${item.http}`).join("; ") || "Sem amostra.",
  }));

  const timings = obs.timings ?? [];
  const slow = timings.filter((item) => item.ttfbMs > 800 || item.loadMs > 3000);
  rows.push(row({
    id: "RF1-PERF-PUBLICA",
    window: "00:13–01:27",
    priority: "P1",
    item: "TTFB e carregamento das páginas públicas da baseline.",
    result: timings.length === 0 ? "BLOCKED" : slow.length ? "FAIL" : "PASS",
    cause: slow.length ? "Alguma página pública passou de 800 ms de TTFB ou 3 s de load." : "A amostra pública ficou dentro desses limites.",
    criterion: "TTFB ≤ 800 ms e load ≤ 3000 ms em home, login, quem somos e agenda.",
    evidence: timings.map((item) => `${item.path} ttfb=${Math.round(item.ttfbMs)} load=${Math.round(item.loadMs)} req=${item.requests}`).join("; ") || "Sem medida.",
  }));

  const legacy = (obs.source?.routes ?? []).filter((item) =>
    ["EDITOR_SIMULADO", "FERRAMENTA_ENGENHARIA", "SUPERFICIE_REJEITADA", "ROTA_PUBLICA_FORA_DO_ROTEIRO", "ROTA_RETIRADA"].includes(item.classification));
  rows.push(row({
    id: "RF1-LIMPEZA",
    window: "06:45–07:22",
    priority: "P1",
    item: "Limpeza segura só depois do inventário. O código legado ainda não sai nesta frente.",
    result: legacy.length ? "FAIL" : "PASS",
    origin: "inventário estático do SHA 6c43aea",
    cause: legacy.length
      ? "O inventário encontrou rotas que a diretriz manda retirar. Esta frente não apaga arquivo de produto."
      : "O inventário não encontrou essas classes.",
    criterion: "Inventário versionado antes de qualquer exclusão. Exclusão fica com o integrador.",
    evidence: `${legacy.length} rotas classificadas como legado ou fora do roteiro. Ver docs/qa/rf1-v1c/inventario.md.`,
  }));

  for (const item of rows) {
    if (item.needsSession && item.result === "PASS" && !obs.sessionOpened && item.id !== "RF1-AUTH" && item.id !== "RF1-PES-CTA" && item.id !== "RF1-MBR-MENU" && item.id !== "RF1-MIN-SUPERFICIE") {
      item.result = "BLOCKED";
      item.cause = "Regra de honestidade: jornada autenticada sem sessão não recebe PASS.";
    }
  }
  if (!obs.sessionOpened) {
    const authRow = rows.find((item) => item.id === "RF1-AUTH");
    if (authRow?.result === "PASS") authRow.result = "BLOCKED";
  }
  return rows;
}

export function summarize(rows) {
  return {
    pass: rows.filter((item) => item.result === "PASS").length,
    fail: rows.filter((item) => item.result === "FAIL").length,
    blocked: rows.filter((item) => item.result === "BLOCKED").length,
    total: rows.length,
  };
}

export function assertReportSafe(text, secret) {
  if (text.includes("accessToken") || text.includes("Bearer ") || text.includes("Authorization:")) {
    throw new Error("Relatório contém material de sessão.");
  }
  if (secret && secret.length >= 8 && text.includes(secret)) {
    throw new Error("Relatório contém a senha usada na tentativa.");
  }
}
