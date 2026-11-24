# Contrato — duplicidade de inscrição, lançamento e sino

Base: `chatgpt/dev-prehml-final-gates-20261123` (`5f32bb3`). DEV/QA. Sem HML, main ou produção.

O corpo de erro continua saindo pelo filtro público. Além de `statusCode` e `requestId`, a raiz traz `code`, `message` e, quando for seguro, `existing` e `overlap`. O frontend deve ler esses campos. Não deve comparar texto de `message`.

`existing` só sai com `id`, `status` e, no lançamento, `description`, `entryDate`, `amountCents`. Qualquer outro campo, inclusive ingresso, Pix ou e-mail, faz o servidor omitir `existing` inteiro.

## Inscrição

`POST /member-events/:slug/registrations` e o registro da equipe.

| Situação | HTTP | code | existing |
| --- | --- | --- | --- |
| Mesma participação ativa, qualquer lote | 409 | `EVENT_REGISTRATION_DUPLICATE` | `{id,status}` só se `registrantPersonId` é a pessoa da sessão |
| Parte dos participantes já inscrita | 409 | `EVENT_REGISTRATION_PARTIAL_OVERLAP` | um registro da própria conta, se houver |
| Participante ainda não inscrito | 201 | — | — |
| Inscrição cancelada, pagamento estornado ou cancelado, evento arquivado | novo registro | — | a linha antiga permanece |

`overlap` é `FULL` ou `PARTIAL`. A resposta parcial pede para reenviar só quem ainda não participa. Não sugere nova cobrança.

A checagem ocorre antes de lote encerrado e de capacidade, e de novo dentro da transação com `pg_advisory_xact_lock` e a chave única `(event_id, identity_key)`. Conflito de concorrência devolve a inscrição vencedora, sem segundo pagamento, vaga, e-mail ou ingresso.

Identidade:

- e-mail normalizado de cada participante, quando a lista existe;
- pessoa da conta, no registro individual de adulto;
- dependente somente como `responsável + nome normalizado`.

Nomes iguais em contas diferentes não bloqueiam. Sem e-mail e sem pessoa da conta, a equipe não bloqueia homônimo. `existing` de inscrição alheia não é devolvido.

Recuperação: `GET /member-events/registrations/:id`, já restrito à conta. QR quando a inscrição está confirmada; Pix ou checkout da tentativa anterior quando o pagamento segue pendente.

## Lançamento

`POST /ledger/expenses`. Campos novos na whitelist: `duplicateJustification` (10–500), `duplicateExistingId` e `externalDocumentId` (1–80, opcional).

| Situação | HTTP | code |
| --- | --- | --- |
| Mesma data, descrição normalizada, valor, contas e centro de custo | 409 | `LEDGER_POSSIBLE_DUPLICATE` |
| Justificativa confere o id e não há outro candidato | 201 | auditoria `ledger.entry.duplicate_justified` na mesma transação |
| Ainda existe outro candidato | 409 | `LEDGER_POSSIBLE_DUPLICATE` com o próximo `existing` |
| Mesmo `externalDocumentId`, ou o mesmo `requestId` com corpo diferente | 409 | `LEDGER_DUPLICATE_CONFIRMED` |
| Replay exato do mesmo `requestId` | 200 | o registro original, sem segunda linha |

Rejeitado e estornado não entram na duplicidade possível. Descrição, valor, categoria, conta ou centro diferentes seguem como lançamentos distintos. A consulta fica na igreja da sessão.

Receita (`POST /ledger/entries`), baixa nova e OFX usam a mesma comparação. Baixa do mesmo pagamento já vinculado responde `LEDGER_DUPLICATE_CONFIRMED`. OFX/CSV continua descartando o mesmo identificador externo e a mesma identidade de movimento, e mantém descrição diferente. Não há índice único novo em linha de extrato, para não falhar em duplicata já gravada e não apagá-la. O vínculo de extrato existente continua `LEDGER_ENTRY_ALREADY_MATCHED`.

Justificativa só existe em `POST /ledger/expenses`. Receita e baixa parecidas respondem 409 sem campo de exceção.

## Sino

O sino continua derivado e lido por `workspace_notification_reads`. Cada fato tem um id estável por registro e destinatário. Erro de formulário não gera item.

Eventos, para a própria conta: pagamento pendente, autorização pendente ou ingresso confirmado nos últimos 30 dias. Secretaria, pastor e administração veem autorização pendente de outra conta, sem nome, em `/app/eventos-gestao/`. Escalas, aprovações, admissões, aniversários e grupos permanecem como estavam.
