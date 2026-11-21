-- Preserve legacy records when upgrading an installation that has not run the
-- historical Conexão alias migration yet. Databases that ran it already are
-- repaired separately, using only records whose origin can be established.
UPDATE ministry_roster_modules
SET name = 'Ofertas legado ' || id,
    name_key = 'ofertas legado ' || lower(id)
WHERE roster_module_canon(name) IN ('ofertas e maquininhas', 'ofertas e maquininha');
