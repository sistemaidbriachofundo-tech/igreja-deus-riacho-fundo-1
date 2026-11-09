# Matriz QA E2E por persona

Gerada em 2026-11-09T16:39:27.210Z. Contagens: **86 PASS**, **3 FAIL**, **2 BLOCKED**.

Uma linha PASS em tela de login não conta como módulo operacional. Jornadas que só encontraram o gate ficam FAIL ou BLOCKED, com o motivo explícito.

| Persona | Jornada | Resultado | ms | Detalhe |
|---|---|---|---:|---|
| PUBLICACAO | Rota /app/ sem sessão | PASS | — | A rota renderiza a tela de login. Esta evidência não aprova Secretaria, membros nem permissões. Evidência: `reports/evidence/public-app-login-gate-1440.png`. |
| PUBLICACAO | Rota /app/membros/ sem sessão | PASS | — | A rota renderiza a tela de login. Esta evidência não aprova Secretaria, membros nem permissões. Evidência: `reports/evidence/public-appmembros-login-gate-1440.png`. |
| PUBLICACAO | Rota /app/secretaria/ sem sessão | PASS | — | A rota renderiza a tela de login. Esta evidência não aprova Secretaria, membros nem permissões. Evidência: `reports/evidence/public-appsecretaria-login-gate-1440.png`. |
| PUBLICACAO | Login frio na publicação | PASS | 516 | O botão de entrar permanece desabilitado e a página avisa que nenhuma credencial será enviada. Evidência: `reports/evidence/public-login-1440.png`. |
| PUBLICACAO | Layout 1440px do gate em /app/secretaria/ | PASS | 1368 | Gate de login sem overflow horizontal (0px). Medição da tela de acesso, não do módulo. Evidência: `reports/evidence/public-secretaria-gate-1440.png`. |
| PUBLICACAO | Layout 360px do gate em /app/secretaria/ | PASS | 1129 | Gate de login sem overflow horizontal (0px). Medição da tela de acesso, não do módulo. Evidência: `reports/evidence/public-secretaria-gate-360.png`. |
| PUBLICACAO | Layout 768px do gate em /app/secretaria/ | PASS | 1250 | Gate de login sem overflow horizontal (0px). Medição da tela de acesso, não do módulo. Evidência: `reports/evidence/public-secretaria-gate-768.png`. |
| SECRETARIA | Abrir ficha | PASS | — | GET da ficha sintética respondeu 200. |
| SECRETARIA | Abrir ficha na interface | FAIL | — | A lista HML não oferece controle para abrir a ficha. A tela de membros não aprova a jornada de prontuário. Evidência: `reports/evidence/hml-membros-busca.png`. |
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
| SECRETARIA | Login frio | PASS | 1067 | Saiu do gate e abriu superfície operacional em /app/. Evidência: `reports/evidence/hml-painel-apos-login-frio.png`. |
| SECRETARIA | Login quente | PASS | 543 | A sessão já armazenada abriu o painel sem novo envio de senha. |
| SECRETARIA | Módulo Secretaria distinto do login | PASS | — | Módulo operacional visível (Protocolos de admissão, Admissões e secretaria, Abrir protocolo fictício, Gestão do site). Esta evidência não é a tela de login. Evidência: `reports/evidence/hml-secretaria-operacional.png`. |
| SECRETARIA | Módulos visíveis na operação | PASS | — | A navegação mostra só as áreas do papel. |
| SECRETARIA | Reabrir ficha | PASS | — | A reabertura devolveu a mesma ficha sintética persistida. |
| SECRETARIA | Reabrir ficha na interface | FAIL | — | Sem ficha aberta, não há como fechar e reabrir o mesmo cadastro na interface HML. |
| SECRETARIA | Membros em 1440px | PASS | 1028 | Overflow horizontal 0px no diretório autenticado. Evidência: `reports/evidence/hml-membros-1440.png`. |
| SECRETARIA | Membros em 360px | PASS | 857 | Overflow horizontal 0px no diretório autenticado. Evidência: `reports/evidence/hml-membros-360.png`. |
| SECRETARIA | Membros em 768px | PASS | 1040 | Overflow horizontal 0px no diretório autenticado. Evidência: `reports/evidence/hml-membros-768.png`. |
| SECRETARIA | Secretaria em 1440px | PASS | 470 | Overflow horizontal 0px no módulo Secretaria. |
| SECRETARIA | Secretaria em 360px | PASS | 540 | Overflow horizontal 0px no módulo Secretaria. |
| SECRETARIA | Secretaria em 768px | PASS | 573 | Overflow horizontal 0px no módulo Secretaria. |
| PASTOR | API /persons/search | PASS | — | Acesso permitido (HTTP 200). |
| PASTOR | API /credentials/me | PASS | — | Acesso recusado com HTTP 403. |
| PASTOR | API /memberships | PASS | — | Acesso recusado com HTTP 403. |
| PASTOR | API /ministries | PASS | — | Acesso permitido (HTTP 200). |
| PASTOR | API /pastoral-cases | PASS | — | Acesso permitido (HTTP 200). |
| PASTOR | API /cms/site-layout | PASS | — | Acesso permitido (HTTP 200). |
| PASTOR | API /ledger/accounts | PASS | — | Acesso recusado com HTTP 403. |
| PASTOR | Pastor não edita ficha de secretaria | PASS | — | HTTP 403, como o contrato atual determina. |
| PASTOR | Login frio | PASS | 985 | Saiu do gate e abriu superfície operacional em /app/. |
| PASTOR | Login quente | PASS | 535 | A sessão já armazenada abriu o painel sem novo envio de senha. |
| PASTOR | Módulos visíveis na operação | PASS | — | A navegação mostra só as áreas do papel. Evidência: `reports/evidence/hml-operacao-pastor.png`. |
| TESOURARIA | API /persons/search | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /credentials/me | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /memberships | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /ministries | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /pastoral-cases | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /cms/site-layout | PASS | — | Acesso recusado com HTTP 403. |
| TESOURARIA | API /ledger/accounts | PASS | — | Acesso permitido (HTTP 200). |
| TESOURARIA | Tesouraria não busca pessoas | PASS | — | HTTP 403, como o contrato atual determina. |
| TESOURARIA | Login frio | PASS | 1169 | Saiu do gate e abriu superfície operacional em /app/. |
| TESOURARIA | Login quente | PASS | 453 | A sessão já armazenada abriu o painel sem novo envio de senha. |
| TESOURARIA | Módulos visíveis na operação | PASS | — | A navegação mostra só as áreas do papel. Evidência: `reports/evidence/hml-operacao-tesouraria.png`. |
| LIDER | API /persons/search | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | API /credentials/me | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | API /memberships | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | API /ministries | PASS | — | Acesso permitido (HTTP 200). |
| LIDER | API /pastoral-cases | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | API /cms/site-layout | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | API /ledger/accounts | PASS | — | Acesso recusado com HTTP 403. |
| LIDER | Líder não abre ficha geral | PASS | — | HTTP 403, como o contrato atual determina. |
| LIDER | Login frio | PASS | 1027 | Saiu do gate e abriu superfície operacional em /app/operacao/. |
| LIDER | Login quente | PASS | 479 | A sessão já armazenada abriu o painel sem novo envio de senha. |
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
| MEMBRO | Login frio | PASS | 1033 | Saiu do gate e abriu superfície operacional em /app/. |
| MEMBRO | Login quente | PASS | 486 | A sessão já armazenada abriu o painel sem novo envio de senha. |
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
| ADMIN | Login frio | PASS | 983 | Saiu do gate e abriu superfície operacional em /app/. |
| ADMIN | Login quente | PASS | 554 | A sessão já armazenada abriu o painel sem novo envio de senha. |
| ADMIN | Módulos visíveis na operação | PASS | — | A navegação mostra só as áreas do papel. Evidência: `reports/evidence/hml-operacao-admin.png`. |
| ADMIN | Admin técnico sem acesso pastoral | PASS | — | HTTP 403, como o contrato atual determina. |
