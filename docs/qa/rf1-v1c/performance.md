# Performance e cascata — baseline publicada

Medição no browser, Navigation Timing e requests da própria navegação. A prévia Vercel não entrou porque não está READY.

## Páginas

| Caminho | HTTP | TTFB (ms) | DOMContentLoaded (ms) | Load (ms) | Requests |
|---|---|---|---|---|---|
| `/` | 200 | 49 | 187 | 321 | 24 |
| `/a-igreja/` | 200 | 17 | 56 | 58 | 20 |
| `/eventos/` | 200 | 15 | 30 | 33 | 21 |
| `/ministerios/` | 200 | 22 | 51 | 68 | 21 |
| `/novidades/` | 200 | 21 | 45 | 59 | 21 |
| `/visita/` | 200 | 26 | 51 | 93 | 24 |
| `/contato/` | 200 | 14 | 39 | 52 | 20 |
| `/login/` | 200 | 24 | 38 | 54 | 17 |
| `/w1-estudio/` | 200 | 42 | 71 | 94 | 16 |
| `/design-system/` | 200 | 26 | 49 | 78 | 15 |
| `/status/` | 200 | 17 | 59 | 64 | 20 |
| `/app/` | 200 | 18 | 31 | 74 | 24 |
| `/app/operacao/` | 200 | 18 | 31 | 88 | 33 |
| `/app/editorial/` | 200 | 16 | 31 | 43 | 24 |

## Requests mais lentos

### /

| Método | Status | Tipo | Caminho |
|---|---|---|---|
| GET | 200 | image | `/igreja-deus-riacho-fundo-1/images/hero-oficial.jpg` |
| GET | 200 | script | `/igreja-deus-riacho-fundo-1/_next/static/chunks/main-app-7f14eaaa767d2178.js` |
| GET | 200 | script | `/igreja-deus-riacho-fundo-1/_next/static/chunks/87c73c54-24122e7b92478d00.js` |
| GET | 200 | script | `/igreja-deus-riacho-fundo-1/_next/static/chunks/18-2b396aa2b0a3c0be.js` |
| GET | 200 | font | `/igreja-deus-riacho-fundo-1/_next/static/media/inter-latin-400-normal.ef6d3f52.woff2` |
| GET | 200 | font | `/igreja-deus-riacho-fundo-1/_next/static/media/montserrat-latin-700-normal.d4df281b.woff2` |
| GET | 200 | document | `/igreja-deus-riacho-fundo-1/` |
| GET | 200 | stylesheet | `/igreja-deus-riacho-fundo-1/_next/static/css/0b22205558187e77.css` |

### /login/

| Método | Status | Tipo | Caminho |
|---|---|---|---|
| GET | 200 | document | `/igreja-deus-riacho-fundo-1/login/` |
| GET | 200 | font | `/igreja-deus-riacho-fundo-1/_next/static/media/montserrat-latin-700-normal.d4df281b.woff2` |
| GET | 200 | stylesheet | `/igreja-deus-riacho-fundo-1/_next/static/css/478d5fbb9d047eb6.css` |
| GET | 200 | script | `/igreja-deus-riacho-fundo-1/_next/static/chunks/webpack-572da1343c1384bd.js` |
| GET | 200 | stylesheet | `/igreja-deus-riacho-fundo-1/_next/static/css/98900a9a42c129d6.css` |
| GET | 200 | font | `/igreja-deus-riacho-fundo-1/_next/static/media/inter-latin-400-normal.ef6d3f52.woff2` |
| GET | 200 | font | `/igreja-deus-riacho-fundo-1/_next/static/media/inter-latin-500-normal.b7b43ace.woff2` |
| GET | 200 | font | `/igreja-deus-riacho-fundo-1/_next/static/media/inter-latin-600-normal.8fb1a964.woff2` |

### /app/

| Método | Status | Tipo | Caminho |
|---|---|---|---|
| GET | 200 | script | `/igreja-deus-riacho-fundo-1/_next/static/chunks/app/app/layout-f1ac457951eaa02b.js` |
| GET | 200 | document | `/igreja-deus-riacho-fundo-1/app/` |
| GET | 200 | stylesheet | `/igreja-deus-riacho-fundo-1/_next/static/css/e53b5bfbb6c519aa.css` |
| GET | 200 | script | `/igreja-deus-riacho-fundo-1/_next/static/chunks/5355-571c65de8a16bf04.js` |
| GET | 200 | script | `/igreja-deus-riacho-fundo-1/_next/static/chunks/app/app/page-131a165b18e98994.js` |
| GET | 200 | stylesheet | `/igreja-deus-riacho-fundo-1/_next/static/css/b0918701ee41ff22.css` |
| GET | 200 | stylesheet | `/igreja-deus-riacho-fundo-1/_next/static/css/478d5fbb9d047eb6.css` |
| GET | 200 | stylesheet | `/igreja-deus-riacho-fundo-1/_next/static/css/98900a9a42c129d6.css` |

Painel autenticado: não medido. O login sintético não abriu sessão.
