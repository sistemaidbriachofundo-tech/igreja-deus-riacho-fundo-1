# Matriz QA E2E por persona

Gerada em 2026-11-09T18:26:34.503Z. Contagens: **80 PASS**, **2 FAIL**, **2 BLOCKED**.

Uma linha PASS em tela de login não conta como módulo operacional. Jornadas que só encontraram o gate ficam FAIL ou BLOCKED, com o motivo explícito.

| Persona | Jornada | Resultado | ms | Detalhe |
|---|---|---|---:|---|
| SECRETARIA | Abrir ficha | PASS | — | GET da ficha sintética respondeu 200. |
| SECRETARIA | Abrir ficha na interface | PASS | — | Existe um controle para abrir a ficha a partir da busca. Evidência: `reports/evidence/hml-membros-busca.png`. |
| SECRETARIA | API /persons/search | PASS | — | Acesso permitido (HTTP 200). |
| SECRETARIA | API /credentials/me | PASS | — | Papel com rota própria respondeu HTTP 200. |
| SECRETARIA | API /memberships | PASS | — | Acesso permitido (HTTP 200). |
| SECRETARIA | API /ministries | PASS | — | Acesso permitido (HTTP 200). |
| SECRETARIA | API /pastoral-cases | PASS | — | Acesso recusado com HTTP 403. |
| SECRETARIA | API /cms/site-layout | PASS | — | Acesso permitido (HTTP 200). |
| SECRETARIA | API /ledger/accounts | PASS | — | Acesso recusado com HTTP 403. |
| SECRETARIA | Buscar pessoa | PASS | — | A busca devolveu a pessoa sintética Bruno do seed. |
| SECRETARIA | Buscar pessoa na interface | PASS | — | O diretório HML filtrou a pessoa sintética Bruno e escondeu as demais linhas. Evidência: `reports/evidence/hml-membros-busca.png`. |
| SECRETARIA | Editar ficha | PASS | — | PATCH idempotente do núcleo familiar sintético foi aceito e auditado pela API. |
| SECRETARIA | Editar ficha na interface | FAIL | — | Não há formulário de edição persistida. O PATCH de pessoa existe na API e não nesta tela. |
| SECRETARIA | Login frio | PASS | 556 | Saiu do gate e abriu superfície operacional em /app/. Evidência: `reports/evidence/hml-painel-apos-login-frio.png`. |
| SECRETARIA | Login quente | PASS | 411 | A sessão já armazenada abriu o painel sem novo envio de senha. |
| SECRETARIA | Módulo Secretaria distinto do login | PASS | — | Módulo operacional visível (Protocolos de admissão, Admissões e secretaria, Abrir protocolo fictício, Gestão do site). Esta evidência não é a tela de login. Evidência: `reports/evidence/hml-secretaria-operacional.png`. |
| SECRETARIA | Módulos visíveis na operação | PASS | — | A navegação mostra só as áreas do papel. |
| SECRETARIA | Reabrir ficha | PASS | — | A reabertura devolveu a mesma ficha sintética persistida. |
| SECRETARIA | Reabrir ficha na interface | FAIL | — | Sem ficha aberta, não há como fechar e reabrir o mesmo cadastro na interface HML. |
| SECRETARIA | Membros em 1440px | PASS | 891 | Overflow horizontal 0px no diretório autenticado. Evidência: `reports/evidence/hml-membros-1440.png`. |
| SECRETARIA | Membros em 360px | PASS | 914 | Overflow horizontal 0px no diretório autenticado. Evidência: `reports/evidence/hml-membros-360.png`. |
| SECRETARIA | Membros em 768px | PASS | 833 | Overflow horizontal 0px no diretório autenticado. Evidência: `reports/evidence/hml-membros-768.png`. |
| SECRETARIA | Secretaria em 1440px | PASS | 411 | Overflow horizontal 0px no módulo Secretaria. |
| SECRETARIA | Secretaria em 360px | PASS | 405 | Overflow horizontal 0px no módulo Secretaria. |
| SECRETARIA | Secretaria em 768px | PASS | 418 | Overflow horizontal 0px no módulo Secretaria. |
| PASTOR | API /persons/search | PASS | — | Acesso permitido (HTTP 200). |
| PASTOR | API /credentials/me | PASS | — | Acesso recusado com HTTP 403. |
| PASTOR | API /memberships | PASS | — | Acesso recusado com HTTP 403. |
| PASTOR | API /ministries | PASS | — | Acesso permitido (HTTP 200). |
| PASTOR | API /pastoral-cases | PASS | — | Acesso permitido (HTTP 200). |
| PASTOR | API /cms/site-layout | PASS | — | Acesso permitido (HTTP 200). |
| PASTOR | API /ledger/accounts | PASS | — | Acesso recusado com HTTP 403. |
| PASTOR | Pastor não edita ficha de secretaria | PASS | — | HTTP 403, como o contrato atual determina. |
| PASTOR | Login frio | PASS | 553 | Saiu do gate e abriu superfície operacional em /app/. |
| PASTOR | Login quente | PASS | 391 | A sessão já armazenada abriu o painel sem novo envio de senha. |
| PASTOR | Módulos visíveis na operação | PASS | — | A navegação mostra só as áreas do papel. Evidência: `reports/evidence/hml-operacao-pastor.png`. |
| TESOURARIA | API /persons/search | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /credentials/me | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /memberships | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /ministries | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /pastoral-cases | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /cms/site-layout | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /ledger/accounts | PASS | — | Acesso permitido (HTTP 200). |
| TESOURARIA | Tesouraria não busca pessoas | PASS | — | HTTP 403, como o contrato atual determina. |
| TESOURARIA | Login frio | PASS | 546 | Saiu do gate e abriu superfície operacional em /app/. |
| TESOURARIA | Login quente | PASS | 420 | A sessão já armazenada abriu o painel sem novo envio de senha. |
| TESOURARIA | Módulos visíveis na operação | PASS | — | A navegação mostra só as áreas do papel. Evidência: `reports/evidence/hml-operacao-tesouraria.png`. |
| LIDER | API /persons/search | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | API /credentials/me | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | API /memberships | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | API /ministries | PASS | — | Acesso permitido (HTTP 200). |
| LIDER | API /pastoral-cases | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | API /cms/site-layout | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | API /ledger/accounts | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | Líder não abre ficha geral | PASS | — | HTTP 403, como o contrato atual determina. |
| LIDER | Login frio | PASS | 550 | Saiu do gate e abriu superfície operacional em /app/operacao/. |
| LIDER | Login quente | PASS | 408 | A sessão já armazenada abriu o painel sem novo envio de senha. |
| LIDER | Módulos visíveis na operação | PASS | — | A navegação mostra só as áreas do papel. |
| MEMBRO | API /persons/search | PASS | — | Acesso recusado com HTTP 403. |
| MEMBRO | API /credentials/me | PASS | — | Papel com rota própria respondeu HTTP 200. |
| MEMBRO | API /memberships | PASS | — | Acesso recusado com HTTP 403. |
| MEMBRO | API /ministries | PASS | — | Acesso recusado com HTTP 403. |
| MEMBRO | API /pastoral-cases | PASS | — | Acesso recusado com HTTP 403. |
| MEMBRO | API /cms/site-layout | PASS | — | Acesso recusado com HTTP 403. |
| MEMBRO | API /ledger/accounts | PASS | — | Acesso recusado com HTTP 403. |
| MEMBRO | Membro não abre ficha de outra pessoa | PASS | — | HTTP 403, como o contrato atual determina. |
| MEMBRO | Membro abre a própria ficha | PASS | — | HTTP 200, como o contrato atual determina. |
| MEMBRO | Login frio | PASS | 549 | Saiu do gate e abriu superfície operacional em /app/. |
| MEMBRO | Login quente | PASS | 413 | A sessão já armazenada abriu o painel sem novo envio de senha. |
| MEMBRO | Módulos visíveis na operação | PASS | — | A navegação mostra só as áreas do papel. |
| EDITOR | Login da persona Editor | BLOCKED | — | O catálogo tem o papel EDITOR_SITE, porém não há usuário sintético no seed (login HTTP 401). Dependência da frente de RBAC/identidade. Nenhuma senha ou token foi registrado. |
| EDITOR | Controles de permissão | BLOCKED | — | Sem usuário sintético EDITOR_SITE no seed. A checagem de editor fica bloqueada na frente de identidade. |
| ADMIN | API /persons/search | PASS | — | Acesso permitido (HTTP 200). |
| ADMIN | API /credentials/me | PASS | — | Papel com rota própria respondeu HTTP 200. |
| ADMIN | API /memberships | PASS | — | Acesso permitido (HTTP 200). |
| ADMIN | API /ministries | PASS | — | Acesso permitido (HTTP 200). |
| ADMIN | API /pastoral-cases | PASS | — | Acesso recusado com HTTP 403. |
| ADMIN | API /cms/site-layout | PASS | — | Acesso permitido (HTTP 200). |
| ADMIN | API /ledger/accounts | PASS | — | Acesso recusado com HTTP 403. |
| ADMIN | Admin técnico sem acesso financeiro | PASS | — | HTTP 403, como o contrato atual determina. |
| ADMIN | Login frio | PASS | 557 | Saiu do gate e abriu superfície operacional em /app/. |
| ADMIN | Login quente | PASS | 396 | A sessão já armazenada abriu o painel sem novo envio de senha. |
| ADMIN | Módulos visíveis na operação | PASS | — | A navegação mostra só as áreas do papel. Evidência: `reports/evidence/hml-operacao-admin.png`. |
| ADMIN | Admin técnico sem acesso pastoral | PASS | — | HTTP 403, como o contrato atual determina. |
