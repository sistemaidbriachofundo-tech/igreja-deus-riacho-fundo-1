# Integrações financeiras — pesquisa #99 (frente A5)

Pesquisa sem acesso bancário. Este diretório é a entrega inteira: documentação, fixtures sintéticas e um contrato executável. Não há cliente HTTP, credencial, cobrança, migração nem alteração do ledger.

**Integração real: BLOCKED.** O provedor da conta e a adquirente da maquininha não foram informados. Detalhe e evidência em [pesquisa-banco-pix-maquininhas.md](./pesquisa-banco-pix-maquininhas.md).

## Arquivos exclusivos

Somente `docs/integracoes-financeiras/**`.

Fora deste PR, de propósito: `packages/db/prisma/schema.prisma`, `packages/shared/**`, `apps/api/src/finance/**`, `apps/web/**`, `package-lock.json` e deploy. A issue #87 reserva schema, shared, lock e deploy ao agente integrador.

## O que já existe e não foi refeito

| Peça | Onde | Uso nesta pesquisa |
|---|---|---|
| Ledger, fundos, orçamento, dupla aprovação | `apps/api/src/finance`, papel `TESOURARIA` | Destino contábil futuro. Nenhuma rota nova. |
| Importação CSV/OFX e `PDF_META` sem linhas | `parseOfxLines`, `POST /ledger/imports` | Extrato de arquivo já é o caminho sem credencial. |
| Adapters `FILE`, `MOCK`, `SICOOB`, `BRB`, `CORA` com `live: false` | `bank-adapters.ts` | Rótulos, não escolha de banco. |
| Conciliação e match manual de linha | `/ledger/bank-lines/:id/match` | A tesouraria confirma. Texto de extrato não posta sozinho. |
| Webhook mock de inscrição | `handleMockPaymentWebhook` | Outro domínio (`CONFIRMED_MOCK`). Não é Pix da tesouraria. |

## Contrato e teste

`contract.mjs` codifica as regras desta pesquisa: txid, e2eid, dedupe de extrato, ciclo do cartão e webhook assinado. Os testes leem as fixtures e falham se o catálogo escolher um fornecedor ou se um fixture trouxer segredo.

```bash
node --test docs/integracoes-financeiras/contract.test.mjs
```

Não há E2E de homologação. Exercitar a API de HML com banco ou maquininha seria a integração que esta issue proíbe.

## Branch

`cursor/a5-pesquisa-pix-banco-e3fe`, a partir de `main`, worktree desta frente. PR em rascunho. Sem merge e sem deploy.
