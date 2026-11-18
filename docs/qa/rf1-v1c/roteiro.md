# Roteiro observável do áudio de 10/11/2026

A transcrição literal não está no repositório. As janelas abaixo são as da issue #171. O texto de cada exigência é o da diretriz substitutiva publicada na #144. Eklesia continua sendo só referência externa.

| Janela | Tela | Exigência observável | IDs |
|---|---|---|---|
| 00:13–01:27 | Home | Início, Quem somos e Agenda numa página com âncoras; login separado; sem assistente público. | RF1-HOME-PAGINA, RF1-HOME-IA, RF1-HOME-EXTRA, RF1-HOME-CONTRASTE, RF1-HOME-SCROLL, RF1-PERF-PUBLICA |
| 01:40–02:06 | Login | Manter o visual aprovado; apagar “Seu acesso é individual”; Sair volta ao destino aprovado. A fala não nomeia esse destino. | RF1-LOGIN-ESTRUTURA, RF1-LOGIN-TEXTO, RF1-LOGIN-ECO, RF1-LOGIN-SAIDA, RF1-AUTH |
| 02:06–03:23 | Admin | Painel premium sem cartão de QA, jargão ou texto de planejamento; corrigir lentidão; barra com perfil, busca, avisos e um Sair. | RF1-ADM-VISUAL, RF1-ADM-LENTIDAO, RF1-ADM-BARRA |
| 03:23–04:38 | Membros e secretaria | Ficha editável e persistente; secretaria distinta; CTAs “Cadastrar pessoa” e “Iniciar admissão”. | RF1-PES-FICHA, RF1-PES-CTA |
| 04:38–05:10 | Credenciais | 409 sem ambiguidade; frente, verso, QR, PDF e revogação. | RF1-CRD-409, RF1-CRD-ABRIR |
| 05:10–06:26 | Ministérios | Acabar com “Ministérios e operação”; o menu abre o catálogo e cada ministério no próprio contexto. | RF1-MIN-SUPERFICIE, RF1-MIN-CONTEXTO |
| 06:26–06:45 | Membro | Visão separada da administração; sem “Meu Espaço” no menu administrativo. | RF1-MBR-MENU |
| 06:45–07:22 | Editor | Redesenhar Mídia/Conteúdo e Gestão do Site; tirar ferramenta técnica, fase, RFC, QA e endpoint; remover o editor simulado. | RF1-EDI-SIMULADO, RF1-EDI-TECNICO, RF1-EDI-INTERNO, RF1-LIMPEZA |

Critério de prévia, fora do relógio do áudio: a regressão da prévia Vercel `id-riacho1-web-hml` só conta quando o deployment estiver READY. Enquanto isso, RF1-PREVIEW fica BLOCKED e as capturas são do Pages oficial do mesmo SHA.
