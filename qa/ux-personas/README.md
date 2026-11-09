# QA visual por perfil

Auditoria independente de navegação e acessibilidade. Este diretório não altera componentes, rotas, design system, API nem dados.

## O que entra

- Portal público integrado: Início, Quem somos e Agenda.
- Login e o gate de `/app` sem sessão.
- Erro de login com e-mail `qa.sintetico@example.test` apenas contra o Next local, com a API desligada.
- Comparação de leitura com os tokens do PR #102, sem copiar esses arquivos.

## O que fica BLOCKED

Dashboards de Pastor, Admin, Tesouraria, Líder e Membro, a secretaria autenticada e a vitrine `/design-system`. Não há mock no lugar dessas telas.

## Como repetir

Na raiz, com dependências instaladas:

```bash
NEXT_PUBLIC_BASE_PATH= npm run dev -w @idbrf/web
```

Nesta pasta:

```bash
npm install
node src/audit.mjs --base http://127.0.0.1:3000 --mode publication
```

Segundo terminal, outro Next, sem banco:

```bash
NEXT_PUBLIC_BASE_PATH= NEXT_PUBLIC_HML_ENABLED=true npx next dev -p 3010
```

O comando precisa rodar em `apps/web`. Depois:

```bash
node src/audit.mjs --base http://127.0.0.1:3010 --mode hml
npm test
```

Os testes de unidade não abrem o navegador. `report.test.mjs` confere a matriz já gerada.
