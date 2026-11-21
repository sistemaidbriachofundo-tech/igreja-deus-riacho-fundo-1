CREATE OR REPLACE FUNCTION roster_module_canon(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  WITH folded AS (
    SELECT btrim(regexp_replace(lower(translate(coalesce(raw, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '\s+', ' ', 'g')) AS key
  )
  SELECT CASE key
    WHEN 'santa ceia' THEN 'ceia'
    WHEN 'diaconia' THEN 'ceia'
    ELSE key
  END
  FROM folded;
$$;

CREATE OR REPLACE FUNCTION roster_module_display(canon text, current_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE canon
    WHEN 'recepcao' THEN 'Recepção'
    WHEN 'apoio interno' THEN 'Apoio Interno'
    WHEN 'conexao' THEN 'Conexão'
    WHEN 'ofertas e maquininhas' THEN 'Ofertas e Maquininhas'
    WHEN 'ceia' THEN 'Santa Ceia'
    ELSE current_name
  END;
$$;

DO $$
DECLARE
  duplicate record;
  keeper_rules jsonb;
  incoming_rules jsonb;
BEGIN
  FOR duplicate IN
    WITH ranked AS (
      SELECT module.id, module.ministry_id, module.name, module.rules,
        roster_module_canon(module.name) AS canon,
        row_number() OVER (
          PARTITION BY module.ministry_id, roster_module_canon(module.name)
          ORDER BY
            (module.name = roster_module_display(roster_module_canon(module.name), module.name)) DESC,
            (SELECT count(*) FROM rosters roster WHERE roster.module_id = module.id) DESC,
            module.id ASC
        ) AS rank
      FROM ministry_roster_modules module
    )
    SELECT drop_row.id AS drop_id, keep_row.id AS keep_id
    FROM ranked drop_row
    JOIN ranked keep_row
      ON keep_row.ministry_id = drop_row.ministry_id
     AND keep_row.canon = drop_row.canon
     AND keep_row.rank = 1
    WHERE drop_row.rank > 1
  LOOP
    SELECT rules INTO keeper_rules FROM ministry_roster_modules WHERE id = duplicate.keep_id;
    SELECT rules INTO incoming_rules FROM ministry_roster_modules WHERE id = duplicate.drop_id;
    IF keeper_rules = '{}'::jsonb AND incoming_rules IS NOT NULL AND incoming_rules <> '{}'::jsonb THEN
      UPDATE ministry_roster_modules SET rules = incoming_rules, updated_at = now() WHERE id = duplicate.keep_id;
    END IF;

    UPDATE ministry_roster_module_memberships keeper
    SET status = 'ATIVO', ended_at = NULL, updated_at = now()
    FROM ministry_roster_module_memberships incoming
    WHERE keeper.module_id = duplicate.keep_id
      AND incoming.module_id = duplicate.drop_id
      AND keeper.membership_id = incoming.membership_id
      AND incoming.status = 'ATIVO';

    DELETE FROM ministry_roster_module_memberships incoming
    USING ministry_roster_module_memberships keeper
    WHERE incoming.module_id = duplicate.drop_id
      AND keeper.module_id = duplicate.keep_id
      AND incoming.membership_id = keeper.membership_id;

    UPDATE ministry_roster_module_memberships
    SET module_id = duplicate.keep_id, updated_at = now()
    WHERE module_id = duplicate.drop_id;

    DELETE FROM ministry_roster_module_leaders incoming
    USING ministry_roster_module_leaders keeper
    WHERE incoming.module_id = duplicate.drop_id
      AND keeper.module_id = duplicate.keep_id
      AND incoming.person_id = keeper.person_id;

    UPDATE ministry_roster_module_leaders
    SET module_id = duplicate.keep_id
    WHERE module_id = duplicate.drop_id;

    UPDATE rosters SET module_id = duplicate.keep_id, updated_at = now()
    WHERE module_id = duplicate.drop_id;

    DELETE FROM ministry_roster_modules WHERE id = duplicate.drop_id;
  END LOOP;

  UPDATE ministry_roster_modules module
  SET name = roster_module_display(roster_module_canon(module.name), module.name),
      name_key = roster_module_canon(module.name),
      updated_at = now()
  WHERE module.name_key IS DISTINCT FROM roster_module_canon(module.name)
     OR module.name IS DISTINCT FROM roster_module_display(roster_module_canon(module.name), module.name);
END $$;
