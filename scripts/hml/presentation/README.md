# Massa fictícia de homologação

Script aditivo, idempotente e reversível para a apresentação do Sistema da Igreja de Deus — Riacho Fundo I. Não entra no `prisma db seed`. Não altera `schema.prisma`, migrations, senhas, ministérios já existentes nem pessoas cujo id não começa com `hmlpres_person_`.

A marca de homologação aparece só neste shell. Os nomes na base são naturais: João Carvalho, Maria Ferreira, Paulo Mendes, Ana Ribeiro e outras pessoas inventadas. E-mail, quando existe, termina em `@example.test`. Não há CPF, telefone, Pix, mensagem ou pagamento.

## Quem aplica

O integrador J, depois de backup do Neon `idriacho1_hml` e revisão deste PR. Um Cloud Agent não deve apontar este comando para o Neon.

```bash
# lê o banco, grava dentro de uma transação e desfaz
HML_SEED_CONFIRM=idriacho1_hml \
  node scripts/hml/presentation/seed-hml.mjs --dry-run

# grava de fato
HML_SEED_CONFIRM=idriacho1_hml HML_SEED_OPERATOR=integrator-j \
  node scripts/hml/presentation/seed-hml.mjs --apply

# remove só as linhas hmlpres_
HML_SEED_CONFIRM=idriacho1_hml HML_SEED_OPERATOR=integrator-j \
  node scripts/hml/presentation/seed-hml.mjs --rollback
```

Sem `DATABASE_URL`, `--dry-run` imprime o plano e não abre conexão. No Postgres de CI (`idbrf` ou `idriacho1_ci` em localhost) a flag `HML_SEED_CI=1` libera a execução. Qualquer outro destino é recusado. `current_database()` precisa coincidir com o nome autorizado.

## O que entra

- Famílias Carvalho, Ferreira, Mendes e Ribeiro, com menores ligados a um responsável adulto.
- Vínculos formais em Homens, Louvor, Jovens, Mulheres, Adolescentes e Atmosfera. Se o ministério já existe, o script reutiliza o id e não troca nome, capa nem liderança. Se não existe, cria o registro.
- Escalas publicadas com confirmação, pendência, recusa e substituição. A mesma pessoa não fica ativa duas vezes no mesmo dia civil de Brasília. Quem tem disponibilidade cadastrada cabe na janela UTC. André Souza tem impedimento em 15 de novembro e não é escalado nesse dia.
- Eventos com inscrição, autorização de responsável para menor e presença só de adultos. Uma contribuição opcional fica pendente, com referência `mock-`, sem provedor externo.
- Carteirinhas opacas para membros com admissão aprovada. O token não leva documento nem contato. O PDF não é gerado aqui.
- Lançamentos aprovados em partida dobrada (oferta, dízimo a receber, despesa a pagar e taxa). A posição derivada fica no manifesto: recebido 18000, a receber 9600, caixa 17700, comprometido 4200, disponível 13500, bruto 27600, taxa 300, líquido 27300, em centavos.
- Três usuários desabilitados e sem senha só são criados quando a congregação ainda não tem três usuários. Senha de usuário existente não é lida de novo nem reescrita.

O manifesto vai para `audit_logs` (`hml.presentation_seed.apply`) e para o stdout, com contagem antes e depois. A segunda execução não duplica linhas. O rollback apaga apenas ids `hmlpres_`.

## Imagens

`apps/web/public/images/synthetic/` e `SOURCES.md`. Para regenerar: `node scripts/hml/presentation/render-avatars.mjs`.

## Bloqueios honestos

- Este PR não aplica a massa no Neon.
- Ministério já publicado conserva o texto e a capa que já estavam lá. A equipe formal entra em `ministry_memberships`.
- `photoStorageKey` aponta para o SVG desta pasta. O storage privado da API continua vazio até alguém copiar os arquivos para o `STORAGE_ROOT` do ambiente.
- A URL relativa da cena não passa no filtro público que só aceita `https`. A landing não passa a exibir essas imagens sozinha.
- Competência novembro/2026 fechada interrompe o script antes de gravar.
