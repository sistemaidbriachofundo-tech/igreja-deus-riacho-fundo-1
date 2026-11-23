# E2E autenticado por persona — banco descartável

Veredito local: **PASS**. PASS 64, FAIL 0, BLOCKED 2.

Nenhuma senha, JWT, segredo TOTP ou link de convite entra neste relatório. O site hospedado não recebeu credencial e o SSO da Vercel não foi contornado. A captura do bloqueio está em `qa/security-f11/reports/dev-sso-blocked.png`.

| Persona | Jornada | Resultado | Evidência |
|---|---|---|---|
| ANON | Sessão ausente | PASS | GET /auth/me sem sessão respondeu 401. |
| ANON | Link direto /persons/search | PASS | Sem sessão o link direto respondeu 401. |
| ANON | Link direto /ledger/accounts | PASS | Sem sessão o link direto respondeu 401. |
| ANON | Link direto /pastoral/prayers | PASS | Sem sessão o link direto respondeu 401. |
| ANON | Link direto /admin/access | PASS | Sem sessão o link direto respondeu 401. |
| ANON | Link direto /indicators/summary | PASS | Sem sessão o link direto respondeu 401. |
| ANON | Link direto /indicators/membership | PASS | Sem sessão o link direto respondeu 401. |
| ADMIN | MFA antes do JWT | PASS | Desafio MFA emitido antes do JWT. |
| ADMIN | Replay do desafio MFA | PASS | O mesmo desafio não emitiu outra sessão. |
| ADMIN | Login e /auth/me | PASS | PLATFORM_ADMIN confirmado na congregação ativa depois do MFA. |
| PASTOR | MFA antes do JWT | PASS | Desafio MFA emitido antes do JWT. |
| PASTOR | Login e /auth/me | PASS | PASTOR confirmado na congregação ativa depois do MFA. |
| SECRETARIA | MFA antes do JWT | PASS | Desafio MFA emitido antes do JWT. |
| SECRETARIA | Login e /auth/me | PASS | SECRETARIA confirmado na congregação ativa depois do MFA. |
| TESOURARIA | MFA antes do JWT | PASS | Desafio MFA emitido antes do JWT. |
| TESOURARIA | Login e /auth/me | PASS | TESOURARIA confirmado na congregação ativa depois do MFA. |
| LIDER_MINISTERIO | MFA antes do JWT | PASS | Desafio MFA emitido antes do JWT. |
| LIDER_MINISTERIO | Login e /auth/me | PASS | LIDER_MINISTERIO confirmado na congregação ativa depois do MFA. |
| MEMBRO | Login e /auth/me | PASS | MEMBRO confirmado na congregação ativa. |
| EDITOR | MFA antes do JWT | PASS | Desafio MFA emitido antes do JWT. |
| EDITOR | Login e /auth/me | PASS | EDITOR_SITE confirmado na congregação ativa depois do MFA. |
| PUBLICADOR | MFA antes do JWT | PASS | Desafio MFA emitido antes do JWT. |
| PUBLICADOR | Login e /auth/me | PASS | PUBLICADOR_SITE confirmado na congregação ativa depois do MFA. |
| TESOURARIA | Tesouraria não busca pessoas | PASS | HTTP 403, como o contrato determina. |
| MEMBRO | Membro não abre ficha alheia | PASS | HTTP 403, como o contrato determina. |
| MEMBRO | Membro abre a própria ficha | PASS | HTTP 200, como o contrato determina. |
| ADMIN | Admin técnico sem pastoral | PASS | HTTP 403, como o contrato determina. |
| ADMIN | Administrador lê o plano de contas | PASS | HTTP 200, como o contrato determina. |
| ADMIN | Administrador não cria conta de recebimento | PASS | HTTP 403, como o contrato determina. |
| SECRETARIA | Secretaria sem ledger | PASS | HTTP 403, como o contrato determina. |
| EDITOR | Editor não busca pessoas | PASS | HTTP 403, como o contrato determina. |
| LIDER_MINISTERIO | Líder não lê outro ministério | PASS | HTTP 403, como o contrato determina. |
| MEMBRO | Membro não lista eventos internos | PASS | HTTP 403, como o contrato determina. |
| PUBLICADOR | Publicador não busca pessoas | PASS | HTTP 403, como o contrato determina. |
| PASTOR | Pastor não lê o ledger | PASS | HTTP 403, como o contrato determina. |
| MEMBRO | Troca para congregação sem grant | PASS | A troca foi recusada e a sessão permaneceu fora da congregação destino. |
| CONVIDADO | Cadastro de convidado | PASS | Conta CONVIDADO criada com senha efêmera e JWT próprio. |
| CONVIDADO | Convidado sem /indicators/summary | PASS | HTTP 403. |
| CONVIDADO | Convidado sem /indicators/membership | PASS | HTTP 403. |
| CONVIDADO | Convidado sem /pastoral/prayers | PASS | HTTP 403. |
| CONVIDADO | Convidado sem /pastoral/congregation | PASS | HTTP 403. |
| CONVIDADO | Convidado sem /ledger/accounts | PASS | HTTP 403. |
| CONVIDADO | Convidado sem /admin/access | PASS | HTTP 403. |
| CONVIDADO | Convidado sem /persons/search | PASS | HTTP 403. |
| CONVIDADO | Carteirinha própria | PASS | A leitura não trouxe carteirinha de outra pessoa. |
| CONVIDADO | Pedido de oração não ecoa o texto | PASS | A criação devolveu só o identificador. |
| CONVIDADO | Convidado não lê o pedido | PASS | HTTP 403. |
| PASTOR | Listagem sem o texto | PASS | Listagem HTTP 200 sem o texto. |
| PASTOR | Sino sem o texto | PASS | Sino HTTP 200 sem o texto. |
| ADMIN | Convite e ativação | PASS | Convite de uso único ativado sem e-mail externo. |
| MEMBRO | Concessão de MEMBRO | PASS | A conta ativada entrou como MEMBRO. |
| LIDER_MODULO | Edição para líder de módulo | PASS | O perfil passou a líder de módulo do Atmosfera. |
| LIDER_MODULO | Sessão antiga revogada na edição | PASS | O JWT anterior deixou de valer. |
| LIDER_MODULO | MFA antes do JWT | PASS | Desafio MFA emitido antes do JWT. |
| LIDER_MODULO | Login do líder de módulo | PASS | Líder de módulo autenticado com MFA. |
| LIDER_MODULO | Módulo do próprio ministério | PASS | HTTP 200 no Atmosfera. |
| LIDER_MODULO | Outro ministério recusado | PASS | HTTP 403. |
| ADMIN | Revogação do perfil | PASS | O grant de liderança foi removido. |
| LIDER_MODULO | Sessão revogada na revogação | PASS | HTTP 401. |
| ADMIN | Recuperação por link de uso único | PASS | A senha anterior foi recusada e a nova foi aceita. Nenhum e-mail externo foi enviado. |
| ANON | Recuperação pública sem enumerar conta | PASS | Conta existente e inexistente receberam a mesma resposta, sem token. |
| ADMIN | Provisionamento qa.rf1.tester | PASS | 8 convites de ativação e 0 indisponíveis. Nenhum link foi registrado. |
| PASTOR | QA tester sem MFA e sem ledger | PASS | A conta fictícia entrou por senha, com PASTOR, e o ledger respondeu 403. |
| PUBLICADOR | Logout revoga a sessão | PASS | Depois do logout, /auth/me voltou 401. |
| PLATAFORMA | Site DEV hospedado | BLOCKED | O site DEV respondeu com a proteção de SSO da Vercel. Nenhum bypass foi tentado e nenhuma credencial foi transmitida. |
| PLATAFORMA | API QA hospedada | BLOCKED | API QA: /ready HTTP 200, database=ok, mfaBlocking=true. /auth/me sem sessão HTTP 401. Nenhuma credencial foi transmitida. |
