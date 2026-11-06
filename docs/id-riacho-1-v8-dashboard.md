# ID Riacho 1 — dashboard e área administrativa V8

## Referência visual
Reprodução em componentes React e CSS (não um print de fundo) do conceito aprovado: lateral verde-escura, logo original circular com cruz e chama, área de trabalho clara, cartões arredondados, acentos dourados e uma capa fotográfica.

## Decisões implementadas
- **Nome do produto:** ID Riacho 1. A identidade institucional segue sendo Igreja de Deus — Riacho Fundo I.
- Sidebar e cabeçalho harmonizados; busca Ctrl+K, menu mobile, foco visível e módulos existentes preservados.
- Dashboard com hero fotográfico, 4 indicadores da base sintética, 8 atalhos funcionais, processos de admissão, avisos de pendências, canal oficial no YouTube e agenda semanal.
- Fotos locais existentes no repositório; o acervo não é apresentado como registro da programação atual.
- Agenda consulta somente a projeção pública /public/home com o release gate de publicação que já existia. Sem integração configurada, mostra um estado vazio explícito.
- Não foram criadas rotas de gestão fictícias nem alteradas autenticação, banco, permissões, Prisma ou lógica de negócio. Não mostrar dados do mockup (412 membros, 24 escalas, 87%) como se fossem verdadeiros.

## Ensaio visual e aceitação
- Rodar lint, typecheck, testes, build, SonarCloud.
- Verificar capturas automatizadas de /app/ nas larguras 390px e 1440px, além das outras páginas internas.
- O indicador de dados sintéticos não pode ser ocultado na publicação.
- Confirmar os atalhos: membros, secretaria, carteirinhas, estúdio editorial, agenda pública, ministérios, YouTube e portal público.
- Após aprovação técnica, integrar PR à main, aguardar GitHub Pages e confirmar URL pública.
