# RF1 · P1 — Secretaria, Conexão, notificações e personas

**Base:** `da22ad2b464dbbbdd22c3d988da4b93b6229f72e` (`chatgpt/dev-fix-timeout-sorteio-louvor-20261123`)  
**Ambiente:** testes locais com Prisma simulado e páginas públicas no `next dev`. Sem deploy, sem migração, sem SMTP, sem cobrança e sem dados pessoais.  
**PR #279:** não foi integrado. Esta frente não altera Louvor.

Veredito desta frente: **NO-GO** para promoção. As correções abaixo estão cobertas por teste. A jornada autenticada no DEV fixo continua **BLOCKED**.

## Correções

- A consulta de aniversariantes da Secretaria e do Pastor passa a incluir quem está só na trilha ativa da congregação.
- O aviso diário continua um por destinatário. Pastor e Secretaria entram pelo ofício. Líder de ministério, líder de grupo e mentor entram só pelo cuidado de outra pessoa: o aniversariante não é avisado de si mesmo por ser líder ou mentor. Mentor de trilha de outra congregação fica de fora.
- Líder, mentor, membro e convidado da congregação leem `GET /reports/birthday-care`: nomes do próprio ministério, grupo ou mentoria, sem telefone. O sino aponta para `/app/servir/aniversariantes/`.
- Associar pessoa a grupo de amizade exige cadastro ativo nesta congregação, vínculo ou matrícula na trilha. Pessoa de outra congregação é recusada. Repetir a associação responde conflito.
- A trilha mostra o grupo já associado e permite associar a um grupo existente. Não há modelo de subgrupo.

## Matriz

| Cenário | Resultado | Evidência |
|---|---|---|
| Aniversário de quem está só na trilha entra na consulta da Secretaria | PASS | `membership-birthdays.spec.ts` |
| Um aviso por destinatário; líder/mentor não recebe o próprio aniversário; pastor recebe uma vez | PASS | `birthday-notices.service.spec.ts` e `piloto-pacote.service.spec.ts` |
| Lista de cuidado sem telefone e sem duplicar a pessoa | PASS | spec da API e `care-birthdays.test.tsx` |
| Pessoa de outra congregação não entra no grupo; duplicata vira conflito | PASS | `groups.service.spec.ts` |
| Matrícula devolve grupos da congregação | PASS | `discipleship.service.spec.ts` |
| Documentos de admissão por modalidade | PASS no serviço já existente | `admission-documents.service.spec.ts` |
| Mapa sem endereço e sem acesso de membro | PASS no serviço já existente | `membership-map-access.spec.ts` |
| Carteirinha: membro não lê credencial de outra pessoa | PASS no serviço já existente | `credentials.access.spec.ts` |
| Início, agenda e login em 1440, 768, 390 e 320 | PASS local | Chrome headless. Página sem overflow. Agenda: quinta 20h, domingo 10h e 19h. Sem selo Ao vivo |
| Cards de eventos publicados | BLOCKED | A API local não estava no ar; a faixa só aparece com eventos publicados |
| Safari iOS físico | BLOCKED | Não há aparelho nesta execução |
| Login das personas no DEV fixo e Vercel SSO | BLOCKED | Sem credencial de QA e sem furar MFA |
| SMTP e push de teste | BLOCKED | Nenhum envio foi feito. Não há caixa de teste autorizada neste ambiente |
| Subgrupo da trilha | BLOCKED | `SmallGroup` não tem grupo pai. Não foi criada migração |
| Ficha 360, revisão pastoral, PDF/QR e mapa no navegador autenticado | BLOCKED | Dependem da sessão que não foi aberta |

## Fora desta entrega

Não houve publicação em HML ou produção, alteração de `main`, migração, seed ou mensagem a destinatário real.
