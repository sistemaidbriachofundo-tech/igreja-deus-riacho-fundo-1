# Observabilidade F1.1-C

Módulo em `apps/api/src/common/observability`. Ele não altera `main.ts`, `app.module.ts`, `auth`, o schema nem os workflows. O integrador da issue de wiring (#189) liga o módulo no root depois da revisão. Até lá, o rate limit antigo continua no ar.

Base desta fatia: `previa/rf1-v1` em `31d3158c7619bbc4c9d24fd9b94e43ef056ab80e`.

## O que entra em produção operacional

Cada resposta HTTP pode gerar **uma** linha JSON no stdout, com `ts` em UTC, `level`, `requestId`, método, rota normalizada, status, duração, `version` e `stage`. O mesmo `requestId` volta no header `X-Request-Id`. Um id recebido só é reaproveitado se for opaco: JWT, CPF, CNPJ e quebra de linha são descartados e o servidor gera `req_` + 16 bytes.

Não entram no log: corpo, headers, cookies, query string, stack completo, e-mail, CPF, senha, URL de banco ou token. O filtro de erro devolve ao cliente só `statusCode`, `message`, `code` e `requestId`. Em 5xx a mensagem é sempre `Erro interno`.

Níveis: `debug`, `info`, `warn`, `error`, `silent`, via `OBSERVABILITY_LOG_LEVEL`. 2xx/3xx e 4xx comuns ficam em `info`. 401, 403 e 429 ficam em `warn`. 5xx fica em `error`. Saúde (`/health`, `/ready`, `/internal/observability/*`) com sucesso não escreve linha, para o healthcheck não lotar o disco.

## Rate limit

A chave é método + rota normalizada + IP do cliente. O IP **não** é o primeiro `X-Forwarded-For`. A cadeia é lida da direita: só contam os saltos cujo peer está em `OBSERVABILITY_TRUSTED_PROXIES`, no máximo `OBSERVABILITY_TRUSTED_HOPS` (0 a 5). `0.0.0.0/0` e `*` são ignorados. Com hops 0, o header é desprezado e vale o socket.

`0.0.0.0/0` não é opção de configuração. Hops maior que o número real de proxies da igreja faz um endereço forjado parecer cliente.

O store padrão é a memória do processo (`MemoryRateLimitStore`):

- serve para um processo só;
- zera no reinício;
- não é compartilhado. Duas instâncias, ou serverless com vários isolates, deixam o limite furado: cada um conta de novo.

Para mais de um processo, injete um cliente Redis **no mesmo VPS** em `ObservabilityModule.forRoot({ redis })` e ligue `OBSERVABILITY_RATE_LIMIT_STORE=redis`. A chave no Redis é SHA-256, sem IP cru. O script faz `INCR` + `PEXPIRE` na primeira hit. Não há serviço pago: Redis local, não Upstash nem APM.

Se o store falha, o padrão é **fechar** (503 genérico no cliente, código `RATE_LIMIT_UNAVAILABLE` só no log). `OBSERVABILITY_RATE_LIMIT_FAIL=open` deixa passar e registra o erro mascarado.

As rotas cobertas são as mesmas do middleware atual: login, verificação de carteirinha, interesse voluntário, inscrição pública, webhook mock e `POST /public/vivi/chat` (limite próprio `VIVI_PUBLIC_RATE_*`, código `VIVI_RATE_LIMITED`).

## Métricas e alertas

`GET /internal/observability/metrics` exige o header `X-Observability-Token`. Sem token configurado (mínimo 16 caracteres) ou com token errado, a resposta é 404 e o token não é escrito no log. O JSON traz contadores de 5xx, 401, 403 e 429, latência p50/p95 da janela recente (512 amostras), readiness e alertas. Não há rota, IP, usuário nem corpo.

Alertas no próprio processo, sem SaaS:

| Código | Quando |
| --- | --- |
| `LATENCY_P95` | p95 acima de `OBSERVABILITY_ALERT_P95_MS` (padrão 2000) depois de `OBSERVABILITY_ALERT_MIN_REQUESTS` |
| `HTTP_5XX` | proporção de 5xx acima de `OBSERVABILITY_ALERT_ERROR_RATIO` (padrão 0,05) |
| `HTTP_401` / `HTTP_403` / `HTTP_429` | volume por minuto acima do limite |
| `NOT_READY` | a última readiness falhou |
| `RATE_LIMIT_NOT_SHARED` | `OBSERVABILITY_EXPECT_SHARED_STORE=1` e o backend efetivo ainda é memória |
| `RATE_LIMIT_MEMORY_FALLBACK` | pediu Redis e o cliente não foi injetado |

`GET /internal/observability/ready` responde só `{ "status": "ready" }` ou, em falha, 503 `{ "status": "unavailable" }`. O erro do probe (host, senha, SQL) fica mascarado no log `readiness.failed`. O `GET /ready` que já existe continua devolvendo `database` porque os smokes de HML exigem esse campo. O filtro só remove campo extra se alguém enfiar segredo nesse 503.

No VPS, um cron local consulta as métricas e sai com código 1 se houver alerta `critical`:

```bash
OBSERVABILITY_METRICS_TOKEN=... node docs/observability-f11/check-alerts.mjs
```

## DEV, HML e PROD

Stdout é a interface. Quem rotaciona é o journald ou o logrotate do VPS, não um segundo arquivo dentro do processo. Exemplo em `api.logrotate`. Custo: uma linha por request de negócio, saúde quieta em sucesso, nível `info` fora de DEV, causa no máximo 160 caracteres.

| | DEV | HML | PROD (Hostinger, um dia) |
| --- | --- | --- | --- |
| `OBSERVABILITY_STAGE` | `dev` | `hml` | `prod` |
| nível padrão | `debug` | `info` | `info` |
| proxy | hops `0` (não há proxy; X-Forwarded-For é ignorado) | hops `1` e o IP do nginx local, por exemplo `127.0.0.1` | igual à HML; nunca `0.0.0.0/0` |
| rate limit | memória | memória se for um processo; Redis local se subir mais de um | Redis local se `OBSERVABILITY_INSTANCES` > 1; ligar `OBSERVABILITY_EXPECT_SHARED_STORE=1` |
| métricas | token só se for testar o endpoint | token no ambiente, curl em localhost | token no ambiente; cron + logrotate; sem agente pago |
| readiness | probe opcional | probe `SELECT 1` injetado pelo integrador | o mesmo probe; o corpo público não leva a URL do banco |

Flags que o integrador liga junto:

```bash
OBSERVABILITY_WIRE_MIDDLEWARE=1
OBSERVABILITY_INSTALL_GLOBALS=1
```

`WIRE` aplica correlação em todas as rotas e o limite nas rotas sensíveis. `INSTALL_GLOBALS` instala o filtro e o interceptor. Sem as duas, importar o módulo não muda o comportamento atual.

## Wiring para o #189

No `AppModule` (não neste PR):

```ts
imports: [
  ObservabilityModule.forRoot({
    probe: { check: () => prisma.$queryRaw`SELECT 1`.then(() => undefined) },
    redis: process.env.OBSERVABILITY_RATE_LIMIT_STORE === "redis" ? redisClient : undefined,
  }),
],
```

No `configure` do **módulo raiz** — middleware registrado num módulo filho não alcança login e, se os dois registrarem, o limite conta em dobro:

```ts
constructor(
  @Inject(OBSERVABILITY_RUNTIME) private readonly runtime: ObservabilityRuntime,
) {}

configure(consumer: MiddlewareConsumer): void {
  applyObservabilityWiring(consumer, this.runtime);
}
```

`OBSERVABILITY_RUNTIME` sai do export do módulo. Remover o `SimpleRateLimitMiddleware` na mesma revisão. O middleware novo não usa o primeiro `X-Forwarded-For`.

Não dá para apontar este PR para `main`: o CI atual só dispara em pull request contra `main`, e a base obrigatória é `previa/rf1-v1`. Os testes rodam no workspace da API (`*.spec.ts` em `src/common/observability`). Não houve deploy, acesso a produção, reset de senha nem mensagem real.
