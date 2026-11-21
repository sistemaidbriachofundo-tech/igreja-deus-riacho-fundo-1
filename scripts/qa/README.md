# Massa visual de DEV

`seed-complete-dev.mjs` completa a base sintética com as 19 imagens de `apps/web/public/images/qa` (commit `61f1ed83`). O padrão é não gravar.

```bash
node scripts/qa/seed-complete-dev.mjs --dry-run
```

`--apply` só segue quando `DATABASE_URL` aponta para o ramo Neon `br-twilight-bonus-b6moawk7`, banco `idriacho1_hml`, com `sslmode=require`, `IDBRF_RUNTIME_STAGE=qa` e `QA_SEED_CONFIRM=br-twilight-bonus-b6moawk7`. Outro host, HML, produção e o endpoint `ep-misty-silence` são recusados antes de abrir conexão. No Postgres local o banco autorizado é `idriacho1_qa_ci`, com `QA_SEED_CI=1` e `QA_SEED_CONFIRM=local-qa-ci`.

A seed não apaga linhas, não cria congregação e não redefine senha. Pessoas, fotos, carteirinhas, eventos, inscrições e pagamentos usam IDs `qaImg*`. E-mails são `@example.test`. Pagamentos ficam em mock, sem Pix nem Mercado Pago live.

Onde ver, depois de um apply confirmado no QA e do deploy deste front em DEV:

- Convidado: agenda e `/eventos/inscricao/?evento=qa-dev-so-para-mocas`
- Membro: `/app/eventos/?evento=qa-dev-so-para-mocas`
- Secretaria: buscar `Pessoa QA 01 (demonstração)` e abrir a carteirinha
- Tesouraria: `qa-dev-oficina` e `qa-dev-enraizados`, somente lançamentos mock
- Editor e publicador: `imageUrl` em `/images/qa/events/*.svg`

As contas já existentes de persona não têm a senha alterada. JPEG vai apenas para `person_photos` das doze pessoas QA.
