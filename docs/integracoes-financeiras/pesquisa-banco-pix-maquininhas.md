# Pesquisa técnica: banco, Pix e maquininhas

**Issue:** #99, frente A5 da #87. **Estado:** pesquisa concluída neste diretório. **Integração real:** BLOCKED.

Nenhum fornecedor foi escolhido. Sicoob, BRB e Cora aparecem porque o enum `BankImportAdapter` já tem esses rótulos com `live: false`. Isso é hipótese de arquivo, não decisão de conta. Stone, Cielo, Rede e as demais adquirentes aparecem pelo mesmo motivo: o ciclo contábil é comum e a marca do terminal não foi informada.

Não há chave Pix, CNPJ, certificado, token ou extrato real neste documento. Os identificadores começam por `SYN`.

## Fontes consultadas

- Contrato da API Pix: [bacen/pix-api `openapi.yaml`](https://github.com/bacen/pix-api/blob/master/openapi.yaml). Limites citados abaixo foram lidos desse contrato (txid, e2eid, paginação, `infoPagador`, webhook).
- [Manual de Padrões para Iniciação do Pix](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf), seção do QR estático: txid EMV 62-05 com no máximo 25 caracteres, ou `***` quando o gerador não usa identificador. O QR estático não é criado pela API Pix.
- Código já em `main`: ledger, importação e webhook mock de eventos. PRs #58, #59 e #62 foram lidos e ficam fora desta frente (site/Vivi, go-live HML, Riachinho).

## O que o repositório já faz

A tesouraria já lança em partidas dobradas, com fundo, centro de custo, orçamento, estorno e dupla aprovação. O controller de `/ledger` exige o papel `TESOURARIA`.

O extrato entra por arquivo:

- CSV e OFX geram `BankStatementLine`. O FITID (ou `CHECKNUM`) vira `externalRef`.
- `PDF_META` grava o lote como `META_ONLY`, com zero linhas. Um PDF de maquininha não é extrato utilizável hoje.
- `GET /ledger/bank-adapters` lista `FILE`, `MOCK`, `SICOOB`, `BRB` e `CORA`, todos com `live: false`. A nota do adapter diz que credencial bancária não é lida. `BLOB_READ_WRITE_TOKEN` não liga banco.
- O match de linha ao lançamento é explícito (`match` / `unmatch`). Não há postagem automática a partir do texto do OFX.

O webhook de inscrição em eventos é outro produto: HMAC local, status `CONFIRMED_MOCK` ou `FAILED_MOCK`, chave em `EventPaymentWebhookReceipt.idempotencyKey`. Serve para o mock de evento. Não cria Pix, não liquida cartão e não deve ser apontado para um PSP.

## Lacuna já visível, sem correção neste PR

`FinanceService.createImport` persiste cada linha parseada do lote e não consulta `externalRef` já importado. Enviar o mesmo OFX de novo abre outro lote com as mesmas linhas. O contrato desta pesquisa recusa a segunda ocorrência do mesmo `externalRef`. Implementar isso em `finance.service.ts` muda comportamento de produção da tesouraria e fica para depois da aprovação do contrato.

## Hipóteses de acesso

O catálogo executável está em `fixtures/hipoteses-provedores.json`. `chosenProvider` e `chosenAcquirer` são `null`. Nenhuma hipótese tem status de escolha.

| Hipótese | O que seria | O que falta para sair de hipótese |
|---|---|---|
| Arquivo CSV/OFX | Já disponível. A tesouraria exporta o extrato e importa. | Nada de credencial. Não cobre QR nem venda de cartão. |
| API Pix do BCB, via PSP da conta | A igreja é usuário recebedor. Quem expõe a API é o PSP onde a conta existe, no contrato do BCB. | Nome do PSP, CNPJ do titular, aplicativo OAuth, certificado ICP-Brasil para mTLS, ambiente de sandbox desse PSP. |
| Rótulos SICOOB, BRB, CORA | Já existem no código como arquivo. | A instituição dizer se a conta é de um deles. Até lá, não há cliente HTTP para escrever. |
| Outro PSP (BB, Caixa, bancos privados, Inter e equivalentes) | Cada um tem portal e pré-requisito próprios. | Bloqueado até a conta ser nomeada. Popularidade não escolhe fornecedor. |
| Maquininha | O ciclo venda / recebível / liquidação é o mesmo entre adquirentes. | Marca do terminal, CNPJ do estabelecimento e se existe API, CSV ou só o crédito no extrato. |
| Open Finance | Leitura depende de receptor regulado e de consentimento. | Este sistema não deve virar iniciador de pagamento. Fora de escopo. |

Pré-requisitos que qualquer PSP de API Pix costuma exigir, e que esta pesquisa não coleta:

1. Conta de recebimento no nome da igreja (ou da mantenedora) e adesão ao produto de API no PSP.
2. Credencial OAuth com escopos no mínimo `cob.write`, `cob.read`, `pix.read` e `webhook.write` quando houver cobrança e notificação.
3. Canal mTLS com certificado ICP-Brasil. O callback de Pix recebido, no contrato do BCB, também declara proteção mTLS.
4. URL HTTPS de webhook sob controle da igreja, estável, com prova de posse do certificado de cliente.
5. Chave Pix da conta associada ao webhook. A chave não entra no git.

A API de HML citada na auditoria DAS está em host Vercel. O callback oficial de Pix pede mTLS. Antes de qualquer sandbox é preciso confirmar um host que termine esse canal. O PR #59, ainda em rascunho, não autoriza deploy nem entrega esse host.

## Limites que vêm do padrão Pix

Estes números são do contrato e do manual, não de uma conta da igreja. O teste trava o catálogo neles.

| Regra | Limite | Consequência para a tesouraria |
|---|---|---|
| `txid` de cobrança imediata ou com vencimento | 26 a 35, `[a-zA-Z0-9]` | Identificador da cobrança. Único por CPF/CNPJ do recebedor naquele PSP. |
| `PUT /cob/{txid}` | criação da cobrança imediata, resposta documentada `201` | O `txid` é a chave da cobrança. Se a chamada expirar, a recuperação é `GET /cob/{txid}`. Gerar outro `txid` abriria outra cobrança. |
| `POST /cob` | o PSP escolhe o `txid` | Pior para conciliação. Não é o caminho proposto. |
| `PATCH /cob/{txid}` | revisão, e o campo `revisao` incrementa | Alterar valor não é um recebimento. |
| QR estático | txid até 25, ou `***` | Não nasce na API Pix. `***` significa ausência de identificador. |
| QR dinâmico | valor e txid do BR Code são ignorados; vale o payload da URL | A conciliação usa o `txid` da cobrança, não o desenho do QR. |
| `endToEndId` | 32 caracteres `[a-zA-Z0-9]` | Identificador do Pix em si. Chave de idempotência do dinheiro. |
| `GET /pix` | `inicio` e `fim` obrigatórios; página padrão 100; máximo 1000 | Consulta de retaguarda tem de paginar. Não substitui o webhook, mas cobre falha de aviso. |
| `infoPagador` | até 140 caracteres | Texto livre de quem pagou. Não classifica sozinho. |
| Webhook `PUT /webhook/{chave}` | só Pix com `txid` são notificados | Pix na chave, sem txid, não gera esse callback. Cai no extrato. |
| Callback | `POST {webhookUrl}/pix`, mTLS, SLA definido pelo PSP, pode agrupar vários Pix da mesma chave | O receptor precisa ser idempotente. O contrato não fixa o intervalo de retentativa. |
| Devolução | id `[a-zA-Z0-9]` de 1 a 35; valor limitado ao Pix original | Devolução não é receita nova. |

O que esta pesquisa não inventa, porque não está no padrão e depende do contrato da conta: teto diário ou noturno, tarifa do PSP, rate limit HTTP de Sicoob/BRB/Cora e taxa da maquininha. Esses itens estão em `limitsNotInvented` no catálogo.

## Modelo de extrato proposto

A linha que já existe (`postedAt`, `amountCents`, `description`, `externalRef`, `matchStatus`) continua sendo o fato bancário. A proposta, ainda sem migração, acrescenta só o necessário para não misturar canais:

- `sourceChannel`: `PIX`, `CARD_SETTLEMENT`, `BOLETO`, `TED`, `CASH` ou `UNKNOWN`.
- `e2eid` e `txid`, ambos opcionais.
- `classification`: `REVIEW`, `SUGGESTED` ou `CONFIRMED_BY_TREASURER`.

Regra que o teste aplica nas fixtures:

- Mesma `externalRef` (FITID, e2eid ou id de liquidação) não entra duas vezes.
- Linha sem referência fica `REVIEW`, mesmo que o texto diga "dízimo".
- Referência com valor conferido pode chegar a `SUGGESTED`.
- Só `CONFIRMED_BY_TREASURER` libera postagem no ledger. Sugestão não lança.

O OFX de `fixtures/extrato-sintetico.ofx` tem duas linhas fictícias: Pix de R$ 50,00 (`SYN-OFX-PIX-001`) e liquidação de cartão de R$ 97,50 (`SYN-OFX-CARD-001`). Os R$ 97,50 são o líquido de uma venda de R$ 100,00 com MDR de fixture de 250 bps, não uma tarifa de mercado.

## Pix: cobrança, idempotência e classificação

Cobrança proposta, quando houver PSP e aprovação:

1. A tesouraria (ou um fluxo já autorizado, como inscrição) reserva um `txid` de 26 a 35 caracteres antes da chamada.
2. `PUT /cob/{txid}` com valor em centavos convertido para a string de duas casas do padrão.
3. Timeout ou resposta ambígua: `GET /cob/{txid}`. Não se cria outro identificador para "tentar de novo".
4. O pagador paga o QR dinâmico. O PSP avisa com `endToEndId`.
5. A caixa de entrada deduplica por `e2eid`. A mesma notificação não gera segundo crédito.
6. Um segundo `e2eid` no mesmo `txid` de cobrança de uso único fica em revisão. Não se assume que a cobrança aceita dois pagamentos.
7. Valor diferente do valor da cobrança fica em revisão e não vincula o `txid`.
8. `infoPagador`, nome e memo de OFX passam por `classifyByText` e permanecem em revisão. A palavra "dízimo" no texto não escolhe a conta de receita.

Pix sem `txid` (transferência pela chave, ou QR estático com `***`) não dispara o webhook de txid. A linha de extrato entra como `REVIEW` até alguém da tesouraria classificar. QR estático com txid curto (1 a 25) pode ser consultado, mas não se confunde com o txid de `PUT /cob/{txid}`.

Devolução usa o id da devolução, não o `e2eid` original como se fosse receita. Valor negativo no contrato cai em revisão (`DEBIT_OR_DEVOLUTION`).

O vetor de assinatura do teste é HMAC-SHA256 em hexadecimal sobre `eventId:resourceId:status`, comparação em tempo constante, segredo literal `synthetic-webhook-not-a-credential`. É o formato mínimo para provar rejeição e replay. Não é o segredo do mock de eventos e não satisfaz o mTLS do BCB. Quando o PSP existir, a autenticação do callback será a do contrato dele (mTLS), e a idempotência continuará sendo o `e2eid`, não a assinatura.

## Cartão: venda, recebível, liquidação

Uma passada na maquininha não é dinheiro na conta. O contrato separa três fatos:

| Fato | Identidade | O que representa |
|---|---|---|
| Venda | id da transação na adquirente, ou terminal + NSU + autorização + data | Valor bruto. Não altera o banco. |
| Recebível | venda + número da parcela | Bruto da parcela, MDR e líquido esperado. |
| Liquidação | id do repasse, e depois o FITID do crédito no extrato | Um crédito pode juntar várias parcelas, já líquido. |

No fixture `SYN-CARD-TX-0001`:

- Venda autorizada de 10000 centavos em 2 parcelas, MDR de fixture 250 bps = 250 centavos.
- Cada recebível fica com bruto 5000, MDR 125, líquido 4875.
- A liquidação sem antecipação é 9750 centavos, o mesmo valor da linha OFX `SYN-OFX-CARD-001`.
- Antecipar a parcela 2 com taxa de fixture de 50 centavos muda o líquido para 9700 e marca a parcela como `ANTICIPATED`. O bruto da venda continua 10000. A taxa de antecipação é despesa, não desaparece dentro do líquido sem rastro.

Idempotência do cartão no contrato:

- O id do evento de webhook é a chave da notificação. Repetir o evento não cria outro repasse.
- Repasse que chega antes da venda fica `UNMATCHED`, um único registro, sem lançamento.
- Quando os recebíveis aparecem, um evento novo pode vincular esse mesmo repasse.
- Repasse já sugerido, avisado de novo com outro id de evento, fica `REVIEW` (`PAYOUT_ALREADY_LINKED`) e o líquido não é somado outra vez.
- Líquido diferente da soma dos recebíveis fica `REVIEW` e não grava valor liquidado.

MDR, prazo e antecipação reais continuam desconhecidos até a adquirente ser nomeada. O teste usa os bps do fixture para travar a aritmética, não para publicar tarifa.

## Contabilização proposta, ainda sem código de ledger

Quando a tesouraria confirmar, o lançamento reutiliza o ledger atual. Rascunho de partidas, em centavos:

- Pix sugerido por txid e depois confirmado: débito no banco pelo valor recebido, crédito na receita indicada pela referência (não pelo texto).
- Venda de cartão confirmada: débito de recebível pelo bruto, crédito de receita pelo bruto; débito de despesa de MDR, crédito reduzindo o recebível. O banco não se mexe.
- Antecipação: débito de despesa da taxa, e o recebível deixa de esperar a data original.
- Liquidação confirmada e batendo com o líquido: débito no banco pelo valor creditado, crédito baixando o recebível. Diferença de centavo permanece em revisão.

Nada disso está implementado. A dupla aprovação que o ledger já tem permanece na frente da postagem.

## Dependências para homologação

Fase 0, esta entrega: documentação, fixtures e `node --test`. Sem rede.

As fases seguintes estão bloqueadas:

1. **Decisão institucional.** Preencher o quadro de decisões abaixo. Sem isso não há sandbox honesto.
2. **Credenciais fora do git.** Aplicativo do PSP, certificado e segredo de webhook chegam por um cofre, nunca por issue, chat ou `.env` commitado. Este PR não pede esses valores.
3. **Host com mTLS.** Confirmar onde o callback de Pix pode terminar. Não usar a API de HML atual como se ela já cumprisse o contrato.
4. **Contrato de schema aprovado pelo integrador.** Tabelas novas (cobrança Pix, venda, recebível, liquidação, caixa de webhook) e a dedupe de `externalRef` alteram `schema.prisma` e o serviço financeiro. A #87 não permite que esta frente faça essa migração sozinha.
5. **Sandbox do PSP e da adquirente, com dinheiro fictício do próprio sandbox.** Ainda assim sem conta real, sem QR publicado para membro e sem mensagem automática.
6. **Só depois,** e com aprovação explícita: qualquer chamada que crie cobrança, mesmo em sandbox.

## Decisões pendentes

| Id | Decisão | Enquanto estiver aberta |
|---|---|---|
| D1 | PSP da conta e CNPJ do titular | `chosenProvider` permanece `null` |
| D2 | Chave Pix de recebimento e se haverá QR dinâmico por finalidade | Não se desenha QR e não se cadastra webhook |
| D3 | Marca da maquininha, CNPJ do estabelecimento, API ou só extrato | Cartão entra pelo crédito OFX, em revisão |
| D4 | Quem confirma a classificação | O contrato exige `CONFIRMED_BY_TREASURER`; a dupla aprovação do ledger não foi alterada |
| D5 | Host do webhook e dono do certificado | Sem URL e sem mTLS |
| D6 | Aprovação do integrador para schema e para a dedupe de FITID | Serviço atual permanece como está |
| D7 | Política de retenção do pagador (nome, documento, texto livre) | Fixture não traz documento de pagador |

## BLOCKED — evidência

| Bloqueio | Evidência |
|---|---|
| Provedor não escolhido | `chosenProvider` e `chosenAcquirer` são `null` em `fixtures/hipoteses-provedores.json`. O teste `validateProviderCatalog` falha se alguém preencher. |
| Adapters sem API | `listBankAdapters()` devolve `live: false` para `SICOOB`, `BRB` e `CORA`. |
| Sem credencial e sem cobrança | Este diretório não contém cliente HTTP. O teste recusa `fetch`, `https.request`, Prisma e campos de segredo nas fixtures. |
| Webhook de evento não é banco | `EventPaymentStatus` só tem estados `*_MOCK` / `PENDING` / `CANCELLED`. |
| Schema e serviço intocados | Nenhuma edição em `schema.prisma`, `packages/shared` ou `apps/api/src/finance`. |
| PRs vizinhos | #58 (site/Vivi), #59 (go-live, rascunho) e #62 (Riachinho) não foram alterados. |
| Deploy | Não houve merge, publicação nem chamada a banco. |

Retomar a implementação pede as decisões D1–D6 e uma aprovação explícita para código de integração. Até lá, o comportamento financeiro de produção permanece o que já está em `main`.
