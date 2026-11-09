# QA E2E independente por persona

Suíte da frente **W0/A5** (issue #94). Os arquivos ficam só em `qa/persona-e2e/`. Esta frente não altera telas, API, schema, `package-lock.json` da raiz nem o workflow de CI. A ligação da suíte no CI compartilhado fica com o agente integrador.

## O que a suíte prova

- A tela de login, sozinha, **não** conta como Secretaria, membros ou operação. O classificador separa `login-gate`, `hml-login` e `operational`.
- Login frio e login quente das contas sintéticas do seed, com o tempo medido e sem meta inventada.
- Busca, abertura, edição e reabertura de pessoa na API e, à parte, na interface.
- Controles de permissão de SECRETARIA, Pastor, Tesouraria, Líder, Membro, Editor e Admin.
- Larguras 360, 768 e 1440 no gate público e no módulo autenticado.

Resultados possíveis: **PASS**, **FAIL** e **BLOCKED**. Falha de produto permanece FAIL.

## Dependências

| Dependência | Situação nesta entrega |
|---|---|
| API + Postgres com seed fictício (`*.demo@example.test`) | Exercitada localmente. Não usa HML remota, segredo nem dado real. |
| `NEXT_PUBLIC_HML_ENABLED=true` | Necessário para o módulo autenticado. A publicação sem essa flag cai no gate de login. |
| Usuário sintético `EDITOR_SITE` | **BLOCKED.** O papel existe no catálogo; o seed não cria a conta. |
| Jornada de ficha na interface | Depende da frente de Secretaria. A API é testada à parte. |
| CI (`.github/workflows`) | **BLOCKED** para esta frente. O integrador é quem altera a configuração compartilhada. |

A senha local do seed é a já documentada no README da raiz. A suíte lê `QA_DEMO_PASSWORD` e não grava senha, JWT nem `sessionStorage` nos relatórios.

## Como executar

Suba Postgres, migração, seed, API (`:3001`) e dois Next:

- `:3000` com `NEXT_PUBLIC_HML_ENABLED=true`, `NEXT_PUBLIC_API_URL=http://127.0.0.1:3001` e `NEXT_PUBLIC_BASE_PATH=`
Os dois Next não podem compartilhar `apps/web/.next`. Suba a publicação e a homologação em diretórios de build separados. A publicação é o mesmo `apps/web` sem `NEXT_PUBLIC_HML_ENABLED`.

Na pasta `qa/persona-e2e`:

```bash
npm install
npx playwright test
npm run test:unit
```

`QA_REQUIRE_STACK=1` faz a ausência de servidor falhar a execução, em vez de parecer uma suíte verde. A matriz sai em `reports/matriz.md` e `reports/matriz.json`. Screenshots ficam em `reports/evidence/` e não incluem token.
