# Piloto DEV — backend, API e banco

Base lida: `feat/rf1-revisao-18-11` em `b68e83573f9c`. A API de QA respondeu `GET /ready` com `database=ok`, `authState=prisma`, `mfaBlocking=true` e esse commit. Não houve login com conta preexistente, alteração de senha, MFA, DNS, HML ou produção.

A verificação de schema usou PostgreSQL 16 local e vazio. As 51 migrações aplicaram do zero; a segunda execução não tinha pendência. O seed fictício rodou duas vezes e manteve 10 usuários, 12 pessoas, 5 membresias e 11 grants. `service_orders` e `admission_document_requirements` ficaram vazios, como deve ser: a ordem de culto e a exigência documental não são inventadas no seed. O teste de integração PostgreSQL passou.

## O que foi reproduzido e corrigido

A decisão de transferência consultava o protocolo só pela organização. A secretaria desta congregação conseguia recusar um protocolo que não entra nem sai daqui. A consulta agora exige origem ou destino nesta congregação e a recusa fora do escopo responde 404, sem gravar.

O membro e o convidado criavam e liam a própria inscrição, mas não tinham como cancelá-la. `POST /member-events/registrations/:registrationId/cancel` cancela só o registro do titular, cancela o pagamento pendente e repete sem duplicar. Inscrição de outra pessoa responde 404. Presença já registrada responde 409 `REGISTRATION_CHECKED_IN` e continua com a equipe do evento.

## O que já existia e foi exercitado

A baixa externa de conta a pagar grava um único lançamento e a repetição devolve o mesmo. O mesmo pagamento existente não entra em duas contas. Despesa de caixa não aceita baixa de conta a pagar. Membro e tesouraria de outra congregação recebem 403. Pastor e administrador continuam sem baixa.

O mapa agrega 200 endereços fictícios de Riacho Fundo I, guarda as regiões com menos de cinco pessoas em `grouped` e não devolve o endereço. A consulta filtra organização, congregação e os estados `ACTIVE`, `INACTIVE` e `PENDING_ADMISSION`. Membro e secretaria de outra congregação não disparam a consulta.

A escala de janeiro de 2027 permanece no mês civil de Brasília. A pesquisa de 25 a 28 de dezembro aponta para janeiro. A preparação depois do dia 28 grava dezembro e janeiro, sem fevereiro, e a repetição não duplica. Confirmação, recusa e substituição seguem cobertas no serviço de escala, sem depender do ano.

Ordem de culto, checklist de admissão e histórico `GET /ledger/expense-approvals?history=1` permanecem os contratos já entregues. Nenhuma exigência documental foi semeada.

## RF-001 a RF-032

| RF | Estado nesta revisão | O que funciona sem decisão externa | Bloqueio real |
|---|---|---|---|
| RF-001 Pessoa | presente | Busca, ficha e escopo por papel | Aceite visual e contas permanentes no DEV |
| RF-002 Famílias | presente | Família e responsável do menor no seed | Guarda em aparelho físico |
| RF-003 Histórico | presente | Transferência conclui a origem e abre admissão no destino | Segunda congregação operada por outra secretaria |
| RF-004 Acesso | presente | MFA obrigatório na API de QA; sessão ausente responde 401 | Senha de QA e autenticação hospedada sem alterar contas |
| RF-005 Admissão | presente | Checklist só bloqueia requisito configurado; anexo antigo permanece | A igreja definir os documentos de cada modalidade |
| RF-006 Cartas | presente na API | Emissão e PDF no contrato | Aceite do texto institucional |
| RF-007 Carteirinha | presente | Emissão, revogação e verificação opaca | Leitura do QR no aparelho |
| RF-008 Acolhimento | presente | Casos e tarefas por papel | Operação do Pastor no DEV |
| RF-009 Sigilo | presente | Papel sem acesso recebe recusa | Auditoria de leitura indevida com contas de QA |
| RF-010 Conexão | presente | Trilha, mentor e matrícula | Liderança no ambiente compartilhado |
| RF-011 Grupos | presente | Pedido, decisão do líder e privacidade | Quais grupos a igreja autoriza publicar |
| RF-012 Ministérios | presente | Catálogo, equipe e caixa por permissão | Aceite das lideranças |
| RF-013 Escalas | presente | Mês, publicação e vaga justificada | Postos e regras do Kairos |
| RF-014 Casais | presente | Casal e exceção no motor da escala | Caso real autorizado |
| RF-015 Confirmação | presente | Confirmar, recusar e substituir | Aceite do voluntário no aparelho |
| RF-016 Financeiro | presente | Aprovação por papel e baixa idempotente | Plano `2.1` no ambiente compartilhado |
| RF-017 Extratos | parcial | OFX e CSV, com deduplicação | Arquivo fictício autorizado de cada banco; PDF continua só metadado |
| RF-018 Conciliação | presente | Conferência e fechamento no contrato | Fechamento com a Tesouraria no DEV |
| RF-019 Orçamento | presente | Período, orçamento e estorno | Prestação com dados autorizados |
| RF-020 Eventos | presente | Modalidade, lote e capacidade | Revisão editorial dos eventos sem marcador de demonstração |
| RF-021 Inscrição | presente | Inscrição, cancelamento do titular, check-in e Pix simulado | Webhook de provedor real |
| RF-022 Menores | presente | Responsável e bloqueio de check-in | Autorização institucional do texto |
| RF-023 Cursos | presente na API | Turma, presença e conclusão | Decisão de certificação |
| RF-024 Biblioteca | parcial | CMS com rascunho e publicação; anexos privados de admissão e despesa | Não há biblioteca documental geral versionada |
| RF-025 Canais | parcial | Fila, consentimento e push no contrato | SMTP, WhatsApp e provedor aprovados; nada foi enviado |
| RF-026 YouTube | parcial | Leitura pública do culto ao vivo, com indisponibilidade explícita | Canal oficial e a decisão de manter a leitura pela página pública |
| RF-027 Vivi | presente na API | Status e chat com consentimento | Política de IA e provedor |
| RF-028 App nativo | ausente | Web autenticada | Não há `apps/mobile`; não foi criado por suposição |
| RF-029 Indicadores | presente | Aniversários e mapa agregado sem endereço | Fórmulas com dados autorizados |
| RF-030 Congregações | parcial | Escopo da congregação piloto e mapa do DF | Segunda congregação e patrimônio operacional |
| RF-031 Auditoria | presente | Trilha de admissão, transferência, inscrição e baixa | Leitura no DEV com administrador |
| RF-032 Acessibilidade | fora deste diff | Contraste e teclado ficam na verificação web | Safari do iPhone |

## Bloqueios que não foram contornados

- Conta permanente de QA e segredo de senha para um caminho autenticado na API hospedada, sem alterar as contas.
- Lista institucional dos documentos obrigatórios por modalidade.
- Credencial de teste ou arquivo sintético autorizado para BRB, Sicoob e Mercado Pago. Importação de arquivo e conciliação local seguem sem conector novo.
- Provedor de e-mail e WhatsApp, se a igreja quiser entrega fora do portal.
- Segunda congregação, se a conclusão da transferência deixar de ser feita pela secretaria de origem.
- App nativo, somente se o web não cumprir o RF-028.
