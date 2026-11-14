# Piloto administrativo do ID Riacho 1

A integração reúne o web do PR #219 e a API do PR #220. A issue #218 mantém o escopo e as decisões do piloto.

## Operação

| Jornada | Ação e regra |
| --- | --- |
| Minha Conta | `GET/PATCH /account/me` para consulta e telefone, `POST /account/me/password` para alterar a senha e revogar sessões, `GET/PUT /account/me/photo` para foto privada. A Ficha 360 e a carteira leem a mesma foto. Senha atual incorreta retorna 400 e a sessão continua. |
| Carteirinha | O QR da tela e o QR dos PDFs recém-gerados abrem `/validar-carteirinha/#token`. Configure `CREDENTIAL_VERIFICATION_WEB_URL` com a URL web e o prefixo do ambiente. A rota pública mostra somente a situação da credencial. |
| Acessos | A administração da organização pode convidar um administrador de congregação. O servidor grava o perfil com a organização e a congregação, sem delegação de perfil administrativo por uma conta limitada à congregação. O link de convite e recuperação é individual e de uso único. |
| Cadastro de evento | Crie o evento, depois a modalidade e o lote. Para um lote pago, o cadastrador escolhe a conta da igreja habilitada pela Tesouraria. Publique o evento e abra o link público de inscrição. |
| Eventos do membro | Em `/app/eventos/`, a conta com papel de membro vê os eventos publicados, inscreve-se e consulta em Minhas inscrições o pagamento ou o ingresso. O servidor vincula pela pessoa da sessão. A inscrição pública permanece disponível para visitantes e os registros antigos mantêm o vínculo original. |
| Pix e presença | A Tesouraria confirma o crédito visto no banco em Pix de eventos. A confirmação registra um único lançamento, libera a inscrição e envia o QR com o código de check-in. Na entrada, use a câmera ou digite o código. Para menores, a equipe confere a autorização antes do check-in. A tela de gestão mantém o relatório de participação. |

## Configuração do DEV

- Aplicar as migrações `20261113210000_account_pilot_backend` e `20261113220000_member_event_registrations` na base de teste. Usar as variáveis web existentes `NEXT_PUBLIC_HML_ENABLED` e `NEXT_PUBLIC_PORTAL_LIVE_ENABLED` para painel e agenda.
- Definir `IDBRF_EVENT_PIX_REQUIRED=true` para o piloto. Para Pix real, usar somente uma conta bancária da igreja habilitada pela Tesouraria. O piloto usa dados fictícios e confirmação manual do crédito.
- Definir `EMAIL_TRANSPORT=test` para testar convites, recuperação e QR sem envio externo. Para entrega real, provisionar a caixa oficial na Hostinger e configurar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SEND_ENABLED` e a origem web dos convites no ambiente autorizado.
- Retestar em navegador as telas operacionais e a câmera nativa no dispositivo de entrada. Verificar a entrega SMTP na caixa de teste autorizada e a restauração do backup antes de usar dados reais.

## Pendências fora desta entrega

Mídias e IA, importação de extratos em PDF, integração bancária direta, aplicativo do membro, patrimônio e expansão para outras congregações continuam no backlog. O uso de dados reais depende do aceite da igreja, revisão de permissões e auditoria e teste de restauração.
