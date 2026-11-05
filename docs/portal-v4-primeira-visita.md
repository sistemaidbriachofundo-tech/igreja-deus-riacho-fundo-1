# Portal público — revisão de experiência V4

Objetivo: evoluir a V3+ já publicada sem refazer a identidade que o usuário considerou próxima do ideal.

## Diagnóstico fundamentado
- O site possuía efeitos avançados, mas a Home priorizava três eventos inventados, ainda que marcados como demonstrativos.
- A página de Contato não respondia a dúvidas básicas de uma pessoa que quer conhecer a igreja.
- O modelo editorial ficava genérico porque a comunidade ainda não forneceu fotos institucionais e informações confirmadas para publicar.

## Mudança
- A Home substitui a vitrine de eventos fictícios por uma seção editorial de **primeira visita**, com fotografia oficial existente no repositório.
- A experiência ajuda a descobrir a igreja, consultar programação confirmada e entrar em contato.
- Página Contato ganha perguntas frequentes com elementos HTML nativos `details` (teclado e sem JavaScript).
- Navegação lateral em desktop aponta à nova seção.
- A agenda demonstrativa permanece em `/eventos/` e nas páginas ministeriais, com todos os avisos.
- A identidade oficial, rotas, Church OS `/app` e backend NestJS permanecem intocados.

## Pendente para elevar autenticidade
- Validar endereço completo e horários de culto com a liderança.
- Substituir fotos genéricas por registros aprovados da congregação, respeitando consentimento.
- Integrar publicação de agenda real pela API F4/F5 após HML.
- A partir desses dados, melhorar SEO local e informações de visita.

## Publicação
Criar PR e validar lint/typecheck/test/build. Não fazer merge ou deploy automático antes de revisão visual.
