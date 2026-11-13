# Piloto administrativo do ID Riacho 1

Checkpoint em 13/11/2026. Base do web 1324103, release HML hml-2026.11.13.1. Backend encaminhado ao Cursor na [issue #218](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/issues/218). Validação desta rodada em DEV com dados fictícios.

## Contrato do frontend

| Jornada | Operação | Comportamento esperado |
| --- | --- | --- |
| Minha Conta | GET /account/me | Nome, e-mail de acesso, telefone ou null, photoPath ou null, canEditProfilePhoto e, quando a regra for distinta, canEditPhone. A sessão identifica a conta. |
| Telefone | PATCH /account/me | Recebe apenas phone. String ou null para remover. Devolve o perfil atualizado. |
| Senha | POST /account/me/password | Recebe currentPassword e newPassword. Sucesso 204 com revogação das sessões. Senha atual incorreta ou senha rejeitada retorna 400/422. Sessão inválida retorna 401. |
| Foto | PUT e GET /account/me/photo | PUT multipart no campo photo, com JPG, PNG ou WebP de até 5 MiB e resposta 204. GET privado entrega a imagem. O backend reutiliza PersonPhoto e a foto aparece na Ficha 360 e na próxima geração da carteirinha. |
| Acessos | GET e POST /admin/access | A API retorna canInviteAdministrator como parte da listagem. O seletor oferece o papel administrativo quando o servidor confirma a capacidade. O POST parte de uma pessoa cadastrada, preserva o escopo da igreja e usa o fluxo de convite por e-mail. |
| Recebimento de eventos | GET /events/payment-accounts e GET/POST/PATCH /events | O catálogo do evento entrega accounts com id e name das contas elegíveis. O evento aceita paymentAccountId com a conta existente escolhida no formulário. Null representa ausência de conta vinculada. Preço, pagamento e confirmação continuam sujeitos às regras do backend. |
| Validação da carteirinha | /validar-carteirinha/#token → GET /credentials/verify/:token | O QR da tela aponta para o portal do próprio ambiente. A página pública exibe só a situação. O token fica no fragmento do portal e vai para a API de validação, sem sessão. O QR do PDF depende da configuração da URL pública no backend. |

## Aceite conjunto em DEV

- Entrar como membro, consultar Minha Conta, atualizar telefone, tirar foto no celular, confirmar a foto na Ficha 360 e no novo PDF da carteirinha. Verificar alteração de senha, revogação de sessão e bloqueio de alteração entre contas.
- Ler o QR da tela e do PDF com a câmera nativa. Confirmar que a página mostra o estado ativo e muda para revogado depois da revogação.
- Convidar administrador a partir de Acessos. Confirmar que um perfil sem autorização não pode conceder acesso. Testar entrega, ativação, expiração, reenvio e recuperação com o remetente oficial da igreja na Hostinger.
- Criar, revisar e publicar um evento, selecionar a conta da igreja no evento pago, fazer a inscrição pública, conciliar o Pix, receber a confirmação com QR no e-mail, registrar presença uma vez e emitir o relatório. Usar pagamento direto à igreja.
- Retestar cadastro e Ficha 360, Tesouraria com aprovação do tesoureiro e do pastor, saldo e extrato, e publicação do site e da agenda.

## Pontos de retomada

O frontend de Minha Conta, do convite de administrador, do seletor da conta do evento e do QR web está nesta entrega. A confirmação de Pix, inscrição pública, envio do QR e check-in por QR seguem como integração com o backend. O e-mail depende da configuração do remetente e do teste de entrega no DEV. A liberação de dados reais depende do aceite da igreja, revisão de permissões e auditoria e teste de restauração.

Backlog posterior ao piloto inclui integração de mídias e IA, importação de extratos PDF, integração bancária direta, aplicativo do membro, patrimônio e expansão para outras congregações.
