-- Papéis editoriais independentes das permissões de secretaria e pastor.
-- Idempotente e sem usuários/grants criados automaticamente.
INSERT INTO roles (id, code, name, description, created_at, updated_at)
VALUES
  ('role_site_editor', 'SITE_EDITOR', 'Editor de site', 'Edita textos, fotos e rascunhos sem publicar nem acessar dados internos', NOW(), NOW()),
  ('role_site_publisher', 'SITE_PUBLISHER', 'Publicador do site', 'Aprova publicação do portal sem acesso a dados sensíveis', NOW(), NOW())
ON CONFLICT (code) DO NOTHING;
