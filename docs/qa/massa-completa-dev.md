# Massa de QA idempotente

A massa nova usa o prefixo estável `qacomp_`. Ela não apaga pessoas, eventos, escalas ou senhas que já existem. A segunda execução atualiza os mesmos identificadores.

## Como executar

O padrão é o plano, sem abrir banco:

```bash
node scripts/qa/seed-complete-dev.mjs --dry-run
node scripts/qa/seed-complete-dev.mjs --report /tmp/qa-seed-report.json
```

`--apply` só grava quando todos estes pontos fecham:

- `DATABASE_URL` é Postgres, o database é `idriacho1_hml` e a URL contém o projeto `flat-tree-17047178` e o ramo `br-twilight-bonus-b6moawk7`
- `sslmode` é `require` ou `verify-full`
- `IDBRF_RUNTIME_STAGE` é `qa` ou `non-production`
- `QA_SEED_CONFIRM=br-twilight-bonus-b6moawk7`
- `QA_SEED_PROJECT=flat-tree-17047178`
- `QA_SEED_OPERATOR=qa-dev`
- `GET https://id-riacho1-api-qa.vercel.app/meta` responde `stage=non-production`
- `GET /ready` responde `database=ok`
- `current_database()` confere com o nome autorizado

HML, produção e qualquer outro Neon são recusados. O nome `idriacho1_hml` sozinho não autoriza a gravação, porque a homologação usa o mesmo nome em outro ramo.

Para repetir o ensaio sem Neon:

```bash
QA_SEED_CI=1 DATABASE_URL=postgresql://localhost/idriacho1_ci node scripts/qa/seed-complete-dev.mjs --apply
```

## O que a massa cria

Trinta e duas pessoas fictícias, com retrato JPEG geométrico (assinatura `FF D8 FF`) só nesses cadastros. Nenhuma foto é atribuída a pessoa já existente. Os e-mails terminam em `@example.test`. Não há CPF, telefone, senha nem Pix pagável.

Eventos publicados a partir de hoje:

| Id | Nome | Capa |
| --- | --- | --- |
| `qacomp_event_mocas` | Só para Moças — DEMONSTRAÇÃO DEV | `/images/qa/events/qacomp-mocas.jpg` |
| `qacomp_event_homens` | Encontro de Homens | `/images/qa/events/qacomp-homens.jpg` |
| `qacomp_event_familias` | Retiro de Famílias | `/images/qa/events/qacomp-familias.jpg` |
| `qacomp_event_enraizados` | Enraizados | `/images/qa/events/qacomp-enraizados.jpg` |
| `qacomp_event_acolhimento` | Acolhimento | `/images/qa/events/qacomp-acolhimento.jpg` |
| `qacomp_event_oficina` | Oficina paga | `/images/qa/events/qacomp-oficina.jpg` |

O evento das moças usa `ticketPolicy=PARTICIPANT`. O retiro tem uma inscrição com três ingressos. A oficina tem lote vencido, pagamento pendente, pagamento mock confirmado e inscrição cancelada. Há quatro eventos passados: culto com presença, oficina encerrada, encontro cancelado e acolhimento arquivado.

Onde olhar depois do `--apply` no QA:

- Agenda pública e área do membro: capas em `/images/qa/events/`
- Ficha 360 e carteirinha: Helena Carvalho e Rafael Ribeiro têm JPEG e carteirinha ativa; Diego Martins está revogada; Camila Rocha segue em admissão, sem carteirinha
- Sem retrato, a ficha e o PDF mostram as iniciais no mesmo quadro. O PDF só embute JPEG com assinatura válida
- Escala `qacomp_roster_atmosfera`, ministério Atmosfera — DEMONSTRAÇÃO DEV: confirma, recusa, substituição, setor, zona e lado
- Aniversário de hoje: Yara Monteiro, exclusiva da Trilha. Amanhã: Otávio Pires
- Tesouraria: despesa `qacomp_entry_despesa` pendente; extratos fictícios BRB, Sicoob e mock; conciliação `qacomp_reconciliation_mes`
- Editor: banner `qacomp-banner-revisao` em revisão, fora do ar público

Contas isoladas, sem senha e sem token de convite neste repositório: `qacomp-admin`, `qacomp-pastor`, `qacomp-secretaria`, `qacomp-tesouraria`, `qacomp-editor`, `qacomp-publicador`, `qacomp-lider`, `qacomp-membro` e `qacomp-convidado`, todos em `@example.test`. A ativação continua pelo convite da própria aplicação.

Leitura de QR: código desconhecido responde que o ingresso não pertence ao evento; segunda leitura do mesmo ingresso volta como duplicada; pagamento pendente e autorização de responsável pendente são recusados. Se a câmera for negada, a janela pede para digitar o código.

Um código de 32 zeros não existe na massa e serve para o caso de QR errado. Os códigos válidos saem só no relatório local do `--apply`, não neste documento.

## Evidência desta entrega

Em 21/11/2026 a API `https://id-riacho1-api-qa.vercel.app/meta` respondeu `stage=non-production`, `pilot=true` e `sourceSha=be257fde96947a79541ea6c7959f354d13cf95ea`. `/ready` respondeu `database=ok` e `commit=be257fde9694`. Esses endpoints não informam projeto nem ramo Neon. `DATABASE_URL` não estava neste ambiente. O `--apply` não foi executado e nenhum banco foi alterado.

Dois `--dry-run` seguidos produziram o mesmo JSON: 32 pessoas, 6 eventos futuros e 4 passados. O teste de memória aplicou a massa duas vezes e manteve as mesmas linhas, sem campo `passwordHash` na atualização. Os JPEG foram decodificados como RGB 96×112 e 640×360.

## Bloqueios fora deste pacote

- SMTP real da Vercel continua capaz de enviar se um fluxo disparar mensagem para fora de `@example.test`
- Mercado Pago desta massa é mock; sandbox live não foi habilitado
- BRB e Sicoob aparecem só como extrato fictício, sem autorização bancária
- A massa não fica visível na interface até o `--apply` no ramo QA confirmado e o deploy do front de DEV que publica `/images/qa`
