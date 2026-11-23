# Revisão completa de entrega — DEV RF1 · 23/11/2026

Parecer: **não entregar**. A API QA está no SHA correto, mas a varredura por todos os tipos de acesso em desktop e celular continua incompleta. Não houve publicação em HML nem em produção nesta rodada.

Base: `feat/rf1-revisao-18-11` / `c97b2d252503a62c8cd5e7c99f1bb730cffe9c18`.  
API: `https://id-riacho1-api-qa.vercel.app` (`stage=non-production`, `database=ok`, `mfaBlocking=true`).  
Web oficial: continua 302 para o login da Vercel — nenhuma tela renderizada.

## 1. Inventário de telas (código do SHA)

### Portal público (10)

| Rota | Seção |
| --- | --- |
| `/` | Início |
| `/a-igreja/` | A Igreja |
| `/eventos/` | Agenda |
| `/eventos/inscricao/` | Inscrição |
| `/login/` | Login |
| `/cadastro/` | Cadastro de convidado |
| `/recuperar-senha/` | Recuperar senha |
| `/redefinir-senha/` | Redefinir senha |
| `/ativar-acesso/` | Ativar acesso |
| `/validar-carteirinha/` | Validar carteirinha |

### Área autenticada (35)

| Rota | Seção |
| --- | --- |
| `/app/` | Início por persona |
| `/app/pastoral/` … `/cuidado/` `/oracoes/` `/admissoes/` `/aniversariantes/` `/congregacao/` `/despesas/` `/mapa/` `/ordem-de-culto/` | Pastoral |
| `/app/pedir-oracao/` | Pedir oração |
| `/app/secretaria/` … `/pessoas/` `/pessoas/mapa/` `/admissoes/` `/aniversariantes/` `/indicadores/` | Secretaria |
| `/app/membros/` `/carteirinha/` | Atalhos de pessoas/carteirinhas |
| `/app/minha-conta/` `/carteirinha/` | Conta e carteirinha própria |
| `/app/ministerios/` | Todos os ministérios |
| `/app/servir/atmosfera/` `/louvor/` `/meu-espaco/` | Escalas |
| `/app/conexao/` | Conexão e trilhas |
| `/app/eventos/` `/eventos-gestao/` | Eventos membro e gestão |
| `/app/tesouraria/` | Tesouraria |
| `/app/relatorios/` | Relatórios |
| `/app/acessos/` | Acessos / provisionamento QA |
| `/app/gestao-do-sistema/` | Regras de negócio |
| `/app/site/` `/editorial/` | Mídia / Gestão do Site |
| `/app/convidado/` | Área do convidado |

Total: **45 páginas** com `page.tsx`. Pastas `/ministerios`, `/visita` e `/status` não têm página exportada nesta árvore.

## 2. Menus por tipo de acesso (contrato `persona-navigation`)

| Acesso | Destino inicial | Itens de menu |
| --- | --- | --- |
| Administrador | `/app/` | Início, Pastoral, Secretaria, Conexão, Carteirinhas, Todos os ministérios, Louvor, Atmosfera, Gestão de eventos, Eventos, Tesouraria, Relatórios, Acessos, Gestão do Sistema, Mídia |
| Pastor | `/app/` | Pastoral, Conexão, ministérios/escalas, gestão de eventos, mídia; tesouraria e secretaria por rota |
| Secretaria | `/app/` | Secretaria, Carteirinhas, ministérios/escalas, gestão de eventos, mídia |
| Tesouraria | `/app/` | Tesouraria; gestão de eventos pela conciliação |
| Líder de ministério | `/app/` | Conexão, Todos os ministérios, Louvor, Atmosfera, gestão de eventos |
| Editor / Publicador | `/app/site/` | Mídia e conteúdo |
| Membro | `/app/servir/meu-espaco/` | Carteirinhas, Meu Espaço, Eventos |
| Convidado | `/app/convidado/` | Minha área, Eventos |

A autorização real continua na API (`401`/`403`). O menu só esconde atalho.

## 3. O que foi exercitado na API hospedada

### Anônimo — 244 endpoints do `/meta`

| Resultado | Qtde | Leitura |
| --- | --- | --- |
| 401 | 228 | privado privado exige sessão |
| 200 | 8 | health, meta, home, events, events/:slug, ministries, oidc/authorize, vivi/status |
| 404 | 5 | recursos inexistentes / stub |
| 400 | 2 | vivi/chat e volunteer-interests sem corpo válido |
| 501 | 1 | oidc/callback |

### Convidado sintético — mesma varredura

| Resultado | Qtde | Leitura |
| --- | --- | --- |
| 403 | 117 | pastoral, pessoas, tesouraria, escalas, regras, CMS, admissões, acessos, OC… |
| 401 | 103 | rotas que exigem papel além da sessão ou desafio |
| 200/201 | 14 | me, churches, credentials/me (card null), indicadores (ver achado), públicos, refresh |
| 400/404/501 | restante | validação ou inexistente |

### Fluxos do convidado (sessão limpa)

- Cadastro → grant `CONVIDADO` → logout → `401 SESSION_REVOKED`.
- `GET /public/ministries`: 5 ministérios publicados, capas no mesmo padrão. Louvor **não** está na lista pública.
- `GET /public/events`: 9 futuros; inscrição em `qa-so-para-mocas` com sessão, lote gratuito e `paymentMode=MOCK_ONLY` → **201** `CONFIRMED` / `CONFIRMED_MOCK`. Código de check-in não é publicado aqui.
- `GET /member-events/registrations`: 200 (lista própria).
- Tentativas de Atmosfera/Louvor/módulos/regras/pastoral/tesouraria/secretaria: **403**.

### Portal público (dados)

- Layout: aparência `dourado`, seções essenciais presentes, `hidden` vazio.
- YouTube: `broadcast: null`.
- Grupos públicos: 1 grupo de teste com texto de encontro fictício.
- Conteúdo `quem-somos` por slug: 404.

## 4. O que **não** foi exercitado (bloqueio)

Uma tentativa cada, senha documentada do seed: contas `qa.rf1.tester.*@example.test` e `*.demo@example.test` → `401 INVALID_CREDENTIALS`.

Sem essas sessões **não** houve, em desktop nem celular:

- edição de integrantes e módulos do Atmosfera;
- geração mensal automática de Louvor;
- publicação de regra na Gestão do Sistema;
- Gestão do Site autenticada;
- secretaria (ficha, admissões, mapa);
- pastoral (orações, OC, mesa);
- tesouraria (contas, OFX, aprovações);
- notificações/outbox com leitura;
- portal do membro com escala e carteirinha emitida;
- captura de viewport 320–1440.

O site DEV não abre sem SSO da Vercel.

## 5. Achados

### P1 corrigido neste PR (ainda fora do deploy da API QA)

- `GET /indicators/summary` e `GET /indicators/membership` aceitavam qualquer sessão, inclusive `CONVIDADO`, e devolviam contagens reais da congregação (ex.: membresias ativas agregadas). O controller passa a exigir os papéis da mesa/relatórios. Convidado e membro comum ficam de fora. Teste de metadados em `indicators.access.spec.ts`.

### P1 abertos

- Personas operacionais sem senha utilizável no executor → sem E2E autenticado completo.
- Site oficial atrás do Deployment Protection.
- Agenda ainda com títulos `TESTE 3M` / `Teste DEV`.
- Louvor ausente do catálogo público; geração mensal não observada em dados publicados.
- SMTP real não exercitado.

### P2

- `/public/content/quem-somos` 404.
- Massa `qacomp_` ainda não é a agenda publicada.
- 34 regras desejadas inexistentes no catálogo de 12.

## 6. Parecer por frente

| Frente | Parecer |
| --- | --- |
| Portal público (API) | Parcial — leituras ok; UX hospedada bloqueada |
| Convidado | Parcial — cadastro, inscrição mock e 403 nos módulos internos |
| Atmosfera / Louvor / regras / secretaria / pastoral / tesouraria / membro / notificações | **NO-GO** — sem sessão do papel |
| Desktop / celular | **NO-GO** — SSO Vercel |
| Segurança mínima anônima | OK parcial — 401 dominante; P1 de indicadores corrigido no código |
| Entrega | **não entregar** |

## 7. Próximo passo seguro

1. Abrir o preview já autenticado na equipe Vercel.  
2. Ativar personas pelo `POST /admin/access/qa-testers` (admin + MFA + preview), sem colar senha/link em issue.  
3. Repetir Atmosfera, Louvor, Gestão do Sistema, Todos os ministérios, secretaria, pastoral, tesouraria, eventos, notificações e portal do membro em desktop e celular.  
4. Implantar a correção de indicadores na API QA antes de nova rodada autenticada de convidado.
