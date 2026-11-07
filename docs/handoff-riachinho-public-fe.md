# Riachinho no portal público — integração frontend HML

## Contrato utilizado

Backend NestJS já existente, sem novas rotas:

- `GET /vivi/status` — configuração e disponibilidade (somente metadados; nenhuma chave).
- `POST /public/vivi/chat` — conversa do visitante, sem JWT, exige `consentAiProcessing: true`.
- `POST /vivi/chat` — conversa dos editores autenticados, já implementada em `ViviEditorialAssistant.tsx`.

Os tipos `ViviChatRequest`, `ViviChatResponse` e `ViviStatusResponse` são importados de `@idbrf/shared`. O alias de código `vivi` é preservado por compatibilidade; o nome apresentado a visitantes e editores é **Riachinho**.

## Ativação explícita e isolamento

O chat público só é renderizado quando **as duas condições** forem satisfeitas durante o build:

1. `NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED=true`.
2. `NEXT_PUBLIC_API_URL` preenchida com a API HTTPS do ambiente.

O site estático do GitHub Pages permanece sem chat público e **sem dependência do banco HML**, pois seu build não configura essas variáveis. A ativação inicial deve acontecer somente no projeto Vercel `id-riacho1-web-hml`.

A chave Gemini ou Manus deve permanecer exclusivamente na API Vercel, nunca no frontend ou em `NEXT_PUBLIC_*`.

## Experiência do visitante

- Atalho flutuante acessível em todas as páginas `PublicPage`, sem prejudicar o conteúdo original.
- Painel responsivo com perguntas sugeridas, histórico curto em memória (não persiste em cookies nem armazenamento local), botão de fechamento e indicador de disponibilidade.
- Consulta tardia ao status somente quando o painel é aberto.
- Consentimento LGPD inicialmente **desmarcado**, obrigatório antes de cada envio.
- Sem JWT: somente conteúdo público e consentido pode seguir para `/public/vivi/chat`.
- Histórico reduzido a no máximo 10 mensagens e 7.200 caracteres, abaixo do limite do backend.
- Respostas do provedor `mock` nunca são apresentadas como respostas reais.
- Tratamento de `429 VIVI_RATE_LIMITED`, `400 VIVI_CONSENT_REQUIRED`, falhas HTTP e rede.
- A pergunta permanece no campo em caso de falha, para que o visitante possa tentar novamente.
- Aviso `lgpdNotice` da API em seção expansível e ressalva de que horários/endereço devem ser conferidos nos canais oficiais.

## Homologação

1. Confirmar que `GET /vivi/status` retorna `provider=gemini` e `geminiKeyConfigured=true`; isso não comprova por si só que a geração funciona.
2. Acessar o portal HML e abrir o Riachinho. Confirmar que a Home e navegação funcionam com o chat fechado.
3. Tentar enviar sem consentimento: botão precisa continuar desabilitado.
4. Aceitar consentimento, perguntar sobre os ministérios com texto sintético e confirmar resposta do Gemini.
5. Simular erro de rede / limite 429 e confirmar que o texto não desaparece.
6. Conferir comportamento e fechamento no celular e desktop.
7. Confirmar no GitHub Pages (produção estática) a ausência do widget até aprovação separada e configuração de API de produção.

**Não há RAG, streaming, visão, agendamento ou acesso a dados de membros nesta entrega.**
