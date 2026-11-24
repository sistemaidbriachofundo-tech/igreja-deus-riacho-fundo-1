-- Conferência de identidade sem gravar CPF. Índice único permite vários nulos.
ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "identity_fingerprint" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "persons_organization_id_identity_fingerprint_key"
  ON "persons"("organization_id", "identity_fingerprint");

-- Regras operacionais. Identidade exata e mudança de família não podem ser afrouxadas pela gestão.
INSERT INTO "system_setting_catalog" ("key", "title", "description", "value_type", "scope_kind", "default_json", "dev_json")
VALUES
  ('secretaria.homonym_warning', 'Aviso de homônimo na Secretaria', 'Quando ativo, um nome igual pede confirmação antes de criar outra ficha. O aviso nunca bloqueia o cadastro e não mostra contato nem documento.', 'boolean', 'CHURCH', 'true', 'true'),
  ('secretaria.identity_exact', 'Cadastro com o mesmo e-mail ou CPF', 'Um e-mail ou CPF já usado aponta para a ficha existente. Esta conferência não pode ser desligada.', 'boolean', 'CHURCH', 'true', 'true'),
  ('household.move_requires_confirmation', 'Confirmação para mudar de família', 'Mover uma pessoa que já tem família exige confirmação. A gestão não pode dispensar essa confirmação.', 'boolean', 'CHURCH', 'true', 'true'),
  ('service_orders.schedule_conflict', 'Conflito da ordem de culto com a escala', 'Avisar pede confirmação antes de aprovar ou publicar. Impedir recusa a publicação enquanto a pessoa estiver na escala do mesmo horário.', 'string', 'CHURCH', '"warn"', '"warn"')
ON CONFLICT ("key") DO NOTHING;
