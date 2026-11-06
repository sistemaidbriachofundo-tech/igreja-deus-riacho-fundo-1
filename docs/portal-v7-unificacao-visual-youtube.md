# Portal V7 — unidade visual entre o site e o Church OS

## Objetivo
Aplicar a identidade V6 aprovada ao ambiente interno, sem misturar os dados ou as permissões do portal público com os fluxos administrativos.

## Design
- Cores alinhadas: verde-petróleo escuro #081c20, superfícies creme #f7f4ed e dourado #d8aa60.
- Menu lateral, barra de busca, rodapé do menu, navegação mobile, modais e foco acessível revisados.
- Faixa de contexto nos módulos internos, com ilustração SVG original; painel inicial com composição fotográfica ilustrativa já disponível no repositório.
- Densidade de informação mantida nos módulos de pessoas, secretaria, carteirinhas e estúdio editorial. Sem alterar as APIs ou a lógica de negócio.
- As fotografias e os vetores são elementos decorativos, não representam pessoas ou eventos recentes.

## Canal
A Home agora tem a seção **A mensagem continua com você**, com acesso ao canal oficial fornecido pela igreja:
https://www.youtube.com/@IDBRiachoFundo1

O acesso está disponível também no rodapé do site e na navegação administrativa. Como o YouTube não disponibilizou uma listagem confiável de IDs de vídeos, não há reprodução automática nem vídeos fictícios. Futura incorporação de transmissões exige verificação de URL/ID e autorização editorial.

## Critérios de publicação
- Executar CI, validar responsividade 320px–1920px, navegação desktop/mobile e conteúdo do site.
- O sistema sintético continua sintético. Nenhuma alteração no banco ou ativação de conteúdo oficial por inferência.
- Apenas a branch de revisão até que os critérios de qualidade sejam atendidos.
