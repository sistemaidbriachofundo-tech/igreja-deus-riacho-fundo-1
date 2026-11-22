BEGIN;

CREATE OR REPLACE FUNCTION roster_module_canon(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  WITH folded AS (
    SELECT btrim(regexp_replace(regexp_replace(lower(translate(coalesce(raw, ''),
      'ÁÀÂÃÄáàâãäÉÈËéèêëÍÌÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[/-]+', ' ', 'g'), '\s+', ' ', 'g')) AS key
  )
  SELECT CASE
    WHEN key IN ('santa ceia', 'diaconia', 'diaconia santa ceia', 'diaconos e santa ceia', 'diaconos santa ceia') THEN 'ceia'
    WHEN key IN ('ofertas e maquininhas', 'ofertas e maquininha') THEN 'ofertas'
    ELSE key
  END FROM folded;
$$;

CREATE OR REPLACE FUNCTION roster_module_display(canon text, current_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE canon
    WHEN 'recepcao' THEN 'Recepção'
    WHEN 'apoio interno' THEN 'Apoio Interno'
    WHEN 'conexao' THEN 'Conexão'
    WHEN 'ofertas' THEN 'Ofertas'
    WHEN 'estacionamento' THEN 'Estacionamento'
    WHEN 'ceia' THEN 'Santa Ceia'
    ELSE current_name
  END;
$$;

DO $$
DECLARE
  legacy record;
  target_id text;
BEGIN
  FOR legacy IN
    SELECT * FROM ministry_roster_modules
    WHERE name = 'Ofertas legado ' || id
       OR (name_key <> 'ofertas' AND roster_module_canon(name) = 'ofertas')
    ORDER BY created_at, id
  LOOP
    SELECT id INTO target_id FROM ministry_roster_modules
      WHERE ministry_id = legacy.ministry_id AND name_key = 'ofertas';
    IF target_id IS NULL THEN
      UPDATE ministry_roster_modules SET name = 'Ofertas', name_key = 'ofertas', updated_at = now()
        WHERE id = legacy.id;
      CONTINUE;
    END IF;

    UPDATE ministry_roster_modules SET
      rules = COALESCE(legacy.rules, '{}'::jsonb) || COALESCE(rules, '{}'::jsonb),
      location_name = COALESCE(location_name, legacy.location_name),
      arrival_contact_name = COALESCE(arrival_contact_name, legacy.arrival_contact_name),
      arrival_instructions = COALESCE(arrival_instructions, legacy.arrival_instructions),
      updated_at = now()
      WHERE id = target_id;

    UPDATE ministry_roster_module_memberships target
      SET status = 'ATIVO', ended_at = NULL, updated_at = now()
      FROM ministry_roster_module_memberships source
      WHERE target.module_id = target_id AND source.module_id = legacy.id
        AND target.membership_id = source.membership_id AND source.status = 'ATIVO';
    UPDATE ministry_roster_module_memberships source SET module_id = target_id, updated_at = now()
      WHERE source.module_id = legacy.id AND NOT EXISTS (
        SELECT FROM ministry_roster_module_memberships target
        WHERE target.module_id = target_id AND target.membership_id = source.membership_id
      );
    UPDATE ministry_roster_module_leaders source SET module_id = target_id
      WHERE source.module_id = legacy.id AND NOT EXISTS (
        SELECT FROM ministry_roster_module_leaders target
        WHERE target.module_id = target_id AND target.person_id = source.person_id
      );
    UPDATE ministry_roster_member_invitations SET module_id = target_id WHERE module_id = legacy.id;
    UPDATE rosters SET module_id = target_id, updated_at = now() WHERE module_id = legacy.id;
    -- Only duplicate links remain on the retired module.
    DELETE FROM ministry_roster_modules WHERE id = legacy.id;
  END LOOP;
END $$;

-- Restore the six QA rosters identified by the original seed and titles.
-- The three empty draft duplicates are closed and retained as history.
UPDATE rosters source
SET module_id = offers.id,
    status = CASE WHEN source.status = 'DRAFT' AND source.portal_event_id IS NULL
      AND NOT EXISTS (
        SELECT FROM roster_slots slot JOIN roster_assignments assignment ON assignment.slot_id = slot.id
        WHERE slot.roster_id = source.id
      )
      AND NOT EXISTS (
        SELECT FROM roster_slots slot JOIN roster_slot_invitations invitation ON invitation.slot_id = slot.id
        WHERE slot.roster_id = source.id
      )
      AND EXISTS (
        SELECT FROM rosters current_roster WHERE current_roster.module_id = offers.id
          AND current_roster.service_at = source.service_at AND current_roster.status IN ('DRAFT', 'PUBLISHED')
      )
      THEN 'CLOSED'::"RosterStatus" ELSE source.status END,
    updated_at = now()
FROM ministry_roster_modules connection
JOIN ministry_roster_modules offers ON offers.ministry_id = connection.ministry_id AND offers.name_key = 'ofertas'
JOIN ministries ministry ON ministry.id = connection.ministry_id AND ministry.slug = 'atmosfera'
WHERE source.module_id = connection.id AND connection.name_key = 'conexao'
  AND ((source.id ~ '^rf1qa3-roster-(9|10|11)-5$' AND source.title = 'TESTE 3M · Equipe de ofertas')
       OR (source.id LIKE 'qa-roster-v2-%' AND source.title LIKE 'Teste DEV · % · Ofertas e Maquininhas'));

COMMIT;
