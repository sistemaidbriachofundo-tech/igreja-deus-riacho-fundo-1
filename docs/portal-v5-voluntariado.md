# Atmosfera — interesse em voluntariado, conexão segura

O backend já oferece \`POST /public/volunteer-interests\` com dados mínimos, auditoria e limite de requisições, além de triagem em \`GET/PATCH /volunteer-interests\` protegidos por RBAC. A V5 inclui uma tela pública de contato **somente para maiores de idade** e somente para a área Atmosfera.

A tela fica invisível por padrão. Para permitir coleta real, é necessário configurar no build:
- \`NEXT_PUBLIC_API_URL\`: API HTTPS validada, CORS e rate-limit homologados;
- \`NEXT_PUBLIC_PORTAL_LIVE_ENABLED=true\`;
- \`NEXT_PUBLIC_VOLUNTEER_INTAKE_ENABLED=true\`;
- \`NEXT_PUBLIC_PRIVACY_URL=https://...\`: política de privacidade pública aprovada.

Sem esses quatro requisitos, o visitante segue usando a jornada de primeira visita e canais existentes, sem formulário que colete dados. Não há publicação automática de inscritos.

Dados coletáveis: nome, e-mail e mensagem opcional (sem detalhes pastorais, documentos, dados de menores ou informações médicas). Exige confirmação de maioridade e consentimento finalístico. A API retorna somente \`received\`, \`id\`, \`stage\`, \`ministrySlug\`; a interface não exibe PII devolvida.

Nunca ativar com seed demonstrativa, sem política de privacidade homologada ou sem capacidade operacional para responder às mensagens.
