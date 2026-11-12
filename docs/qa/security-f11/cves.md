# Dependências

`npm audit --omit=dev` neste lockfile: 8 altos, 1 moderado(s), 0 crítico(s).

O mesmo comando com `--omit=optional` tira o CLI Prisma e o deepmerge, que o lockfile marca como `devOptional`. O que permanece no grafo de runtime é a cadeia `@vercel/blob` → `@vercel/oidc` → `@vercel/cli-config` → `zod@4.1.11`, mais `next@15.5.29` → `postcss@8.4.31`.

Nenhum upgrade foi aplicado. A recomendação só vale depois de teste na frente dona do pacote.

| Pacote | Versão no lock | Severidade | Entra no processo que atende pedido? | Aviso |
| --- | --- | --- | --- | --- |
| @prisma/config | 6.19.3 | high | não | via deepmerge-ts |
| @vercel/blob | 2.9.0 | high | sim | via @vercel/oidc |
| @vercel/cli-config | 0.3.1 | high | sim | via zod |
| @vercel/oidc | 3.8.10 | high | sim | via @vercel/cli-config |
| deepmerge-ts | 7.1.5 | high | não | https://github.com/advisories/GHSA-ggr8-5vv4-36mx |
| next | 15.5.29 | moderate | não | via postcss |
| postcss | 8.4.31 | high | não | https://github.com/advisories/GHSA-qx2v-qp2m-jg93<br>https://github.com/advisories/GHSA-6g55-p6wh-862q<br>https://github.com/advisories/GHSA-fxqj-rqcc-2cmp<br>https://github.com/advisories/GHSA-r28c-9q8g-f849 |
| prisma | 6.19.3 | high | não | via @prisma/config |
| zod | 4.1.11 | high | sim | https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 |

## Efeito e correção proposta

### @prisma/config

Dependência do CLI Prisma, também devOptional. O client de runtime é @prisma/client.

Tratar junto com o CLI. Não fazer upgrade solto nesta frente.

### @vercel/blob

Dependência direta da API, usada no upload público de foto do site. O alerta alto entra por @vercel/oidc, não por um defeito isolado de armazenamento.

Subir @vercel/blob somente para uma versão cujo lock deixe zod em 4.6.6 ou acima, e repetir o teste de upload de JPG, PNG, WebP e arquivo disfarçado.

### @vercel/cli-config

Fixa zod em 4.1.11. O aviso é de memória ao validar coleções grandes, não de leitura de segredo.

A correção testável é uma versão de @vercel/cli-config que declare zod >= 4.6.6, puxada pelo blob. Override manual fica para o integrador depois do teste de mídia.

### @vercel/oidc

Entra no processo da API porque @vercel/blob 2.9.0 depende dele. O efeito observado é o zod antigo puxado por @vercel/cli-config.

Não override cego de pacote transitivo. Trocar a cadeia a partir de uma release nova do blob e testar o upload.

### deepmerge-ts

Esgotamento de pilha ao fundir objetos recursivos no carregamento de configuração do CLI Prisma.

Fora do processo da API. Manter o CLI em devDependency e só subir quando a versão corrigida passar por generate e migrate em banco isolado.

### next

O moderado do Next, neste audit, chega via postcss. O app web é export estático. Não há execução de postcss no pedido do visitante.

Tratar como o postcss. Não marcar o portal como corrigido enquanto o lock continuar em 8.4.31.

### postcss

postcss 8.4.31 é dependência de build do Next 15.5.29. Os avisos são XSS na serialização de CSS e leitura de source map na compilação. O runtime da API não importa postcss. O portal não compila CSS enviado por visitante.

Não adotar o major do Next só por este aviso. Caminho curto: override de postcss para a faixa corrigida, build do web e a suíte já existente. O PR de major fica separado e revisado.

### prisma

O pacote é o CLI de migração, marcado devOptional no lockfile. Não atende pedido HTTP.

Não promover o CLI a dependência de runtime. Repetir o audit com --omit=dev --omit=optional no gate de produção.

### zod

zod 4.1.11 pode consumir memória demais ao validar coleções com limite. Quem chama esse zod é a cadeia do blob, com entrada vinda do serviço da Vercel, não do corpo bruto de um fiel.

Não editar package.json nesta frente. O integrador ensaia a cadeia nova em QA e compara o lock antes de aceitar.
