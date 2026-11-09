# Matriz QA E2E por persona

Gerada em 2026-11-09T20:56:12.140Z. Contagens: **52 PASS**, **4 FAIL**, **7 BLOCKED**.

Uma linha PASS em tela de login não conta como módulo operacional. Jornadas que só encontraram o gate ficam FAIL ou BLOCKED, com o motivo explícito.

| Persona | Jornada | Resultado | ms | Detalhe |
|---|---|---|---:|---|
| PUBLICACAO | Sessão ausente | PASS | — | GET /auth/me sem sessão respondeu 401. |
| PUBLICACAO | Agenda pública sem cobrança | PASS | — | A agenda pública não oferece Pix nem cobrança. Evidência: `reports/evidence/g-eventos-1440.png`. |
| PUBLICACAO | Foco visível no campo de senha | PASS | — | O campo focado tem contorno ou sombra. Evidência: `reports/evidence/g-foco-teclado.png`. |
| PUBLICACAO | Portal oficial sem módulo financeiro | PASS | — | A home oficial mostra a superfície pública e não a tesouraria. Evidência: `reports/evidence/g-pages-home.png`. |
| PUBLICACAO | Formulário oficial habilitado | BLOCKED | — | O botão de entrar do link oficial está habilitado. O workflow da main publica esse site com a API HML. Nenhuma credencial foi enviada daqui. Evidência: `reports/evidence/g-pages-login.png`. |
| PUBLICACAO | Tab alcança e-mail e senha | PASS | — | Tab chegou aos dois campos sem uso do mouse. Evidência: `reports/evidence/g-foco-teclado.png`. |
| PLATAFORMA | API HML remota | BLOCKED | — | Não há HML_PUBLIC_API_URL nem segredo de homologação neste agente. A matriz acima é da API sintética local. O link oficial não recebe esta suíte autenticada. |
| PLATAFORMA | Jornadas autenticadas no link oficial | BLOCKED | — | GET /health da API HML pública respondeu 200 e /meta anuncia o contrato 0.7.2-f2. Não enviei credencial e não tratei esse anúncio como prova de ficha, vínculo, agenda ou editor. A matriz autenticada é da API sintética local. |
| SECRETARIA | Login e /auth/me de SECRETARIA | PASS | 45 | POST /auth/login e GET /auth/me confirmaram SECRETARIA na organização e na congregação ativas. |
| SECRETARIA | Contraste de texto no módulo | PASS | — | Menor razão medida: 9.85:1. O mínimo de texto comum é 4.5:1. |
| SECRETARIA | Criar, reler e arquivar evento sintético | PASS | — | O evento fictício foi gravado, relido e arquivado. Não houve publicação nem cobrança. |
| SECRETARIA | Evento sem cobrança | PASS | — | A criação do evento sintético não devolveu Pix, checkout nem URL de pagamento. |
| SECRETARIA | Eventos sintéticos persistidos | PASS | — | GET /events devolveu o encontro sintético de jovens já gravado no seed. |
| SECRETARIA | Buscar e abrir ficha na interface | PASS | — | A busca isolou Bruno e a ficha separou campos graváveis dos campos só de consulta. Evidência: `reports/evidence/g-ficha-1440.png`. |
| SECRETARIA | Editar campo permitido e persistir | PASS | — | A família sintética foi alterada, salva e confirmada pela reabertura da API. O valor original foi restaurado em seguida. Evidência: `reports/evidence/g-ficha-1440.png`. |
| SECRETARIA | Reabrir a mesma ficha | PASS | — | Reabrir devolveu o valor gravado, sem substituí-lo por um rascunho local. |
| SECRETARIA | Vínculo de ministério em 360px | FAIL | — | Overflow horizontal de 78px. Evidência: `reports/evidence/g-ministerios-360.png`. |
| SECRETARIA | Secretaria em 1440px | PASS | — | Sem overflow horizontal (0px). Evidência: `reports/evidence/g-secretaria-1440.png`. |
| SECRETARIA | Secretaria em 360px | PASS | — | Sem overflow horizontal (0px). Evidência: `reports/evidence/g-secretaria-360.png`. |
| SECRETARIA | Secretaria em 768px | PASS | — | Sem overflow horizontal (0px). Evidência: `reports/evidence/g-secretaria-768.png`. |
| SECRETARIA | Menu por papel | FAIL | — | Menu genérico. Fora do papel: Tesouraria. |
| SECRETARIA | Saldo ministerial sem contrato financeiro | PASS | — | HTTP 501 e balance nulo. Nenhum valor de centro de custo foi calculado. |
| SECRETARIA | Tela de vínculo não finge persistência | PASS | — | A tela mostra o bloqueio do vínculo formal e não registra integrante. Evidência: `reports/evidence/g-ministerios-1440.png`. |
| SECRETARIA | Secretaria sem ledger | PASS | — | HTTP 403, como o contrato atual determina. |
| SECRETARIA | Ctrl K abre a busca e Esc fecha | PASS | — | O atalho de teclado abriu e fechou a busca de módulos. |
| SECRETARIA | Zoom 200% na Secretaria | PASS | — | Zoom 200% sem overflow horizontal (0px). Evidência: `reports/evidence/g-zoom-200-secretaria.png`. |
| PASTOR | Login e /auth/me de PASTOR | PASS | 38 | POST /auth/login e GET /auth/me confirmaram PASTOR na organização e na congregação ativas. |
| PASTOR | Pastor não edita ficha | PASS | — | HTTP 403, como o contrato atual determina. |
| TESOURARIA | Login e /auth/me de TESOURARIA | PASS | 39 | POST /auth/login e GET /auth/me confirmaram TESOURARIA na organização e na congregação ativas. |
| TESOURARIA | Posição sintética sem Pix | PASS | — | A posição exibida veio do ledger sintético. A ilustração está separada e Pix, banco e maquininha seguem bloqueados. Evidência: `reports/evidence/g-tesouraria-1440.png`. |
| TESOURARIA | Menu por papel | FAIL | — | Menu genérico. Fora do papel: Membros e famílias, Secretaria, Carteirinhas, Ministérios e operação, Vínculo de ministério, Escalas, Meu Espaço, Mídia e conteúdo, Gestão do site. |
| TESOURARIA | Tesouraria não lista eventos internos | PASS | — | HTTP 403, como o contrato atual determina. |
| TESOURARIA | Tesouraria não busca pessoas | PASS | — | HTTP 403, como o contrato atual determina. |
| LIDER | Login e /auth/me de LIDER | PASS | 40 | POST /auth/login e GET /auth/me confirmaram LIDER_MINISTERIO na organização e na congregação ativas. |
| LIDER | Líder não cria evento em outro ministério | PASS | — | O líder não criou evento no ministério de homens. |
| LIDER | Líder só vê evento do ministério autorizado | PASS | — | A lista do líder contém só o ministério de jovens. |
| LIDER | API não inventa integrantes | PASS | — | HTTP 501 MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED e members nulo. A API não grava integrante formal. O schema é do integrador H. A resposta não inventa a lista. |
| LIDER | Vínculo formal do ministério autorizado | BLOCKED | — | HTTP 501 MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED e members nulo. A API não grava integrante formal. O schema é do integrador H. A resposta não inventa a lista. |
| LIDER | Líder não lê outro ministério | PASS | — | HTTP 403, como o contrato atual determina. |
| MEMBRO | Meu Espaço não finge agenda | PASS | — | Meu Espaço declara que não há consulta da agenda pessoal e não monta lista de outras pessoas. Evidência: `reports/evidence/g-meu-espaco-1440.png`. |
| MEMBRO | Agenda própria persistida | BLOCKED | — | Não existe agenda própria persistida para este perfil (listagem HTTP 403). Confirmar pelo identificador não substitui a lista. Evidência: `reports/evidence/g-meu-espaco-1440.png`. |
| MEMBRO | Login e /auth/me de MEMBRO | PASS | 37 | POST /auth/login e GET /auth/me confirmaram MEMBRO na organização e na congregação ativas. |
| MEMBRO | Membro não edita o site | PASS | — | O membro não grava o rascunho editorial. |
| MEMBRO | Membro não cria evento | PASS | — | O membro não criou evento. |
| MEMBRO | Membro não vê saldo inventado | PASS | — | A conta não leu o ledger. As métricas dizem Sem consulta, a ilustração está rotulada e não há Pix. Evidência: `reports/evidence/g-tesouraria-membro.png`. |
| MEMBRO | Troca para congregação sem grant | PASS | — | POST /auth/switch-church para a congregação destino sem grant respondeu 403. |
| MEMBRO | Congregação inexistente | PASS | — | Congregação inexistente também foi recusada. |
| MEMBRO | Sessão permanece na congregação original | PASS | — | Depois da troca recusada, /auth/me continua fora da congregação destino. |
| MEMBRO | Menu por papel | FAIL | — | Menu genérico. Fora do papel: Membros e famílias, Secretaria, Ministérios e operação, Vínculo de ministério, Escalas, Tesouraria, Mídia e conteúdo, Gestão do site. Evidência: `reports/evidence/g-nav-membro.png`. |
| MEMBRO | Busca de pessoas sem sessão | PASS | — | HTTP 401, como o contrato atual determina. |
| MEMBRO | Membro não abre ficha alheia | PASS | — | HTTP 403, como o contrato atual determina. |
| MEMBRO | Membro não lista eventos internos | PASS | — | HTTP 403, como o contrato atual determina. |
| MEMBRO | Membro abre a própria ficha | PASS | — | HTTP 200, como o contrato atual determina. |
| MEMBRO | Membro não lê vínculo formal | PASS | — | HTTP 403, como o contrato atual determina. |
| EDITOR | Login e /auth/me de EDITOR | PASS | 36 | POST /auth/login e GET /auth/me confirmaram EDITOR_SITE na organização e na congregação ativas. |
| EDITOR | Login e /auth/me de PUBLICADOR | BLOCKED | 8 | O catálogo tem PUBLICADOR_SITE, mas o seed sintético não cria a conta (login HTTP 401). Sem usuário, /auth/me não foi exercido. Nenhum segredo foi registrado. |
| EDITOR | Editor não publica | PASS | — | O editor não publica o site institucional. |
| EDITOR | Conta sintética de publicador | BLOCKED | — | O catálogo tem PUBLICADOR_SITE, mas o seed sintético não cria a conta (login HTTP 401). Sem usuário, /auth/me não foi exercido. Nenhum segredo foi registrado. |
| EDITOR | Rascunho editorial persistido e restaurado | PASS | — | O rascunho do editor foi gravado, relido e restaurado. A publicação institucional não foi chamada. |
| EDITOR | Editor não busca pessoas | PASS | — | HTTP 403, como o contrato atual determina. |
| ADMIN | Login e /auth/me de ADMIN | PASS | 56 | POST /auth/login e GET /auth/me confirmaram PLATFORM_ADMIN na organização e na congregação ativas. |
| ADMIN | Admin técnico sem ledger | PASS | — | HTTP 403, como o contrato atual determina. |
| ADMIN | Admin técnico sem pastoral | PASS | — | HTTP 403, como o contrato atual determina. |
