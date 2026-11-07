# Visão de entrega integral do DAS — 07/11/2026

**Fonte:** DAS IDG-DAS-001, v1.1 (03/11/2026), catálogo RF-001 a RF-032. **Estado:** auditoria inicial, não homologação institucional.

## Objetivo e endereços

- Frontend único: https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/
- API de **HML**: `https://id-riacho1-api-hml.vercel.app` — contrato anunciado `0.7.2-f2`; banco com dados sintéticos.
- O backend declara 140 endpoints como `implemented` em `GET /meta`. **Isso não significa que as 140 jornadas foram executadas, nem que existem telas ou integrações externas homologadas.**
- O GitHub Pages é um host público estático; autenticação, autorização e persistência devem acontecer na API, não no browser. Não colocar segredos no build.
- **Portal público:** não habilitar `NEXT_PUBLIC_PORTAL_LIVE_ENABLED` enquanto a API servir eventos e blocos como `Culto em Família (demo)`, `Encontro de Jovens (demo)` e `Bem-vindo à casa (demo)`. Conteúdo aprovado precisa substituir o seed fictício antes de ir ao público.
- **Área `/app`:** a proposta deste PR habilita o frontend de homologação `HmlPhaseOne` (login e operações F2) diretamente no domínio GitHub Pages; banner explícito HML/100% fictícios e **sem uso de cadastros reais**. Isso NÃO equivale a produção institucional de dados.
- **Frontend Vercel:** não utilizar; backend Vercel pode permanecer ativo como API.

## Legenda de status

- `API declarada`: rota consta em `GET /meta`, mas não há evidência E2E neste levantamento.
- `FE HML`: existe fluxo de frontend conectado à API de testes; exige verificação de autenticação, persistência e permissões.
- `FE demo`: existe interface/dados de navegador sem persistência institucional.
- `Pendente`: não foi identificada implementação integral verificável; pode haver backend parcial ou lógica aproveitável.
- **Nenhum item está classificado como 'concluído' sem teste de usuário, persistência, autorização e evidência.**

## Matriz de cobertura — todos os 32 requisitos

| RF | Domínio e requisito do DAS | Evidência inicial observada | Pendência principal para aceite E2E | Responsável prioritário |
|---|---|---|---|---|
| RF-001 | Pessoa única, contatos, foto, histórico e visitantes | API `/persons/search`, `/persons/:id`; FE HML pessoas; FE demo independente | CRUD completo, foto, duplicidade, histórico e testes com API | Cursor BE + ChatGPT FE |
| RF-002 | Famílias, dependentes, responsáveis legais | API `/households`; FE HML famílias | Vínculo, guarda, privacidade de menores, testes | Cursor BE + ChatGPT FE |
| RF-003 | Histórico congregacional, ministérios e situação | API `/transfers` e vínculos | Jornada e histórico visível, sem duplicação `person_id` | Cursor BE + ChatGPT FE |
| RF-004 | Autenticação, função, congregação e finalidade | API `/auth/login`, `/auth/me`, `/auth/switch-church` e MFA | Escopo de usuário e testes RBAC+ABAC, MFA institucional | Cursor BE + ChatGPT FE |
| RF-005 | Secretaria: admissão, transferência, documentos | API `/admissions`, documentos e `/transfers`; FE HML admissão | Fluxo modalidade→documentos→secretaria→pastor; cancelamento e histórico | Cursor BE + ChatGPT FE |
| RF-006 | Cartas, certificados e declarações versionados | API `/letters` declarada | Emissão/documentos versionados com aprovação e PDF | Cursor BE + ChatGPT FE |
| RF-007 | Carteirinha PDF/QR: emissão, reemissão, revogação | API `/credentials`; FE HML emissão/revogação | PDF real, QR, segunda via, verificação, elegibilidade e auditoria | Cursor BE + ChatGPT FE |
| RF-008 | Acolhimento: tarefa, responsável e prazo | API `/pastoral-cases` tarefas | Frontend autorizado e fluxo de acompanhamento testado | Cursor BE + ChatGPT FE |
| RF-009 | Atendimento pastoral sigiloso | API `/pastoral-cases` | Perfil/finalidade, bloqueio de leitura indevida, auditoria | Cursor BE + ChatGPT FE |
| RF-010 | Discipulado: trilhas, mentor e progresso | API `/discipleship/tracks`, `/discipleship/enrollments` | Jornada de matrícula e progresso no frontend | Cursor BE + ChatGPT FE |
| RF-011 | Células: líder, anfitrião, presença e frequência | API `/small-groups` | Reuniões, presença, relatórios e frontend | Cursor BE + ChatGPT FE |
| RF-012 | Ministérios, funções e voluntários | API `/ministries`; editor de conteúdo público | Equipes, funções, vínculo `person_id`, jornadas internas | Cursor BE + ChatGPT FE |
| RF-013 | Criar/publicar escalas, detectar conflitos | API `/rosters`, `/slots` | Interface de escala, disponibilidade e motor de conflito | Cursor BE + ChatGPT FE |
| RF-014 | Casais e exceções configuráveis | Não verificada implementação integral | Regras configuráveis por ministério + casos de teste | Cursor BE |
| RF-015 | Confirmar, recusar, substituir e notificar | API `/assignments/.../confirm|decline|substitute` | Fluxo do voluntário, histórico e idempotência de mensagens | Cursor BE + ChatGPT FE |
| RF-016 | Financeiro: plano de contas, receitas e despesas | API `/ledger/accounts`, `/ledger/entries` | Telas restritas e trilha de aprovação por papel | Cursor BE + ChatGPT FE |
| RF-017 | Importar extratos CSV/OFX/PDF | API `/ledger/imports` declarada | Parser real, formato suportado, proveniência e rejeição duplicada | Cursor BE |
| RF-018 | Conciliação e aprovação financeira | API `/ledger/reconciliations` | Correspondência/revisão/segregação de funções/teste | Cursor BE + ChatGPT FE |
| RF-019 | Orçamento, fechamento, estorno, prestação de contas | API de estorno e conciliação | Orçamento, relatório fechado, autorização e reversões auditáveis | Cursor BE + ChatGPT FE |
| RF-020 | Eventos multitrilha e capacidade por modalidade | API `/events`, API pública de eventos | Modalidades, lotes, família/casal e vagas; não publicar seed demo | Cursor BE + ChatGPT FE |
| RF-021 | Inscrição, pagamento, check-in e cancelamento | Rotas específicas não localizadas no `/meta` | Implementar fluxos + webhook idempotente quando autorizado | Cursor BE + ChatGPT FE |
| RF-022 | Alojamento, transporte, alimentação e menores | Não verificada implementação integral | Responsável legal, limites e opções por inscrição | Cursor BE + ChatGPT FE |
| RF-023 | Cursos/EBD: turmas, presença, certificado | Não localizadas rotas específicas | Módulo e jornadas; autorização para certificação | Cursor BE + ChatGPT FE |
| RF-024 | Biblioteca de materiais, versões e aprovação | API CMS de conteúdos, não prova biblioteca documental | Documentos/processos versionados + permissões | Cursor BE + ChatGPT FE |
| RF-025 | WhatsApp, SMTP, push; consentimento e fila | Não localizadas rotas de envio no `/meta` | Integrações aprovadas, opt-out, idempotência, observabilidade | Cursor BE; instituição |
| RF-026 | YouTube e Instagram oficiais | Referências/links no FE | Integrações permitidas, fallback, não inventar conteúdo | ChatGPT FE; instituição |
| RF-027 | IA assistiva, fontes e RBAC; RAG quando aprovado | `/vivi/status` e `/public/vivi/chat`, Gemini estruturado | E2E real, fontes, recusas, privacidade e política de RAG | Cursor BE + ChatGPT FE |
| RF-028 | Aplicativo do membro Android/iOS | Portal web responsivo não substitui app nativo | Verificar presença `apps/mobile`, escopo, build, distribuição | Cursor + instituição |
| RF-029 | Indicadores, relatórios e fórmulas | API `/indicators/summary`, `/indicators/membership` | Dashboards por perfil, fórmulas e dados reais autorizados | Cursor BE + ChatGPT FE |
| RF-030 | Congregações, regiões, governança e patrimônio | API `/churches`, `/auth/switch-church` | Testes anti-vazamento regional; patrimônio e relatórios | Cursor BE + ChatGPT FE |
| RF-031 | Auditoria protegida em todos os domínios | API `/audit-logs` | Eventos críticos completos, leitura restrita e antialteração | Cursor BE |
| RF-032 | Acessibilidade, teclado, contraste, mobile | CI possui build + capturas de tela PR | Testes WCAG/interação 390/768/1440 com evidência real | ChatGPT FE |

## Divisão de trabalho — sem conflitos

**ChatGPT — frontend / GitHub Pages / QA:**
1. Validar site oficial, basePath, rotas, CTAs e comportamento no iPhone.
2. Ligar `/app` à **HML autenticada e claramente fictícia**, preservando a vitrine pública.
3. Evoluir interfaces e integração por consumo de APIs estabilizadas, sem alterar NestJS/Prisma.
4. Testar comportamento, erros, permissões e acessibilidade; não afirmar que endpoints anunciados são fluxos completos.
5. PRs exclusivos em `apps/web/**`, documentação de frontend e etapas de build Pages com revisão.

**Cursor — API / banco / integrações / infraestrutura:**
1. Entregar contrato consolidado, payloads e erros por domínio.
2. Corrigir fluxos F2–F6 faltantes, migrations, scopes, RBAC/ABAC, uploads e outbox.
3. Garantir dados sintéticos segregados da futura operação real e não publicar seeds fictícios.
4. Fornecer ambientes seguros, backups verificáveis, testes e evidência por RF.
5. Evitar modificar `apps/web/**` e workflow de Pages simultaneamente às mudanças ChatGPT sem combinar arquivo/PR.

**Aprovação humana / institucional:** domínio e marca, política LGPD, real-data go-live, contratação/integrações bancárias, pagamentos, WhatsApp, papel pastoral e financeiro, app stores.

## Corte seguro para hoje

1. CI de PR verde, sem redeploy do frontend Vercel.
2. Admin F2 em `/app` no GitHub Pages com login, aviso HML e persistência **somente sintética**; homologar cenário real antes de chamar funcional.
3. Riachinho no site e POST validado com consentimento; nenhuma informação privada enviada ao Gemini.
4. CMS público: manter flags de publicação live desligadas até remover `(demo)` e aprovar textos/eventos.
5. Relatório com `testado`, `falhou`, `pendente`, evidência e próximo bloqueio por RF.

**Definição de pronto:** usuário autorizado faz a operação, recupera o estado persistido, passa por permissões do servidor, existe teste positivo e negativo e há evidência rastreável. Nenhum percentual pode ser atribuído só porque a API declara uma rota.
