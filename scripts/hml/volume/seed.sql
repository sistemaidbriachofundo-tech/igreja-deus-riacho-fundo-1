-- Execute every step in one transaction. The remote runner sets idbrf.qa_branch.
DO $$
BEGIN
  IF current_database() <> 'rf1qa' AND (
    current_database() <> 'idriacho1_hml'
    OR nullif(current_setting('idbrf.qa_branch', true), '') IS NULL
    OR current_setting('neon.branch_id', true) IS DISTINCT FROM current_setting('idbrf.qa_branch', true)
    OR current_setting('neon.branch_id', true) = 'br-jolly-darkness-b6f5mzsy'
  ) THEN RAISE EXCEPTION 'Massa de QA permitida somente na cópia isolada'; END IF;
END
$$;
-- step
SELECT pg_advisory_xact_lock(hashtext('idbrf.qa-volume.rf1'));
-- step
CREATE TEMP TABLE qa_scope ON COMMIT DROP AS
SELECT o.id AS org, c.id AS church,
       (SELECT id FROM users WHERE email='platform.demo@example.test' AND status='ACTIVE') AS actor
FROM organizations o JOIN churches c ON c.organization_id=o.id
WHERE o.slug='igreja-de-deus' AND c.slug='riacho-fundo-1';
-- step
DO $$
BEGIN
  IF (SELECT count(*) FROM qa_scope WHERE actor IS NOT NULL) <> 1
  THEN RAISE EXCEPTION 'Congregação ou administrador sintético indisponível'; END IF;
END
$$;
-- step
UPDATE persons SET email=NULL, display_name='Conta de homologação reservada', updated_at=now()
WHERE organization_id=(SELECT org FROM qa_scope)
  AND (email NOT LIKE '%@example.test' OR id IN (SELECT person_id FROM users WHERE email NOT LIKE '%@example.test'));
-- step
UPDATE users SET email='qa.reservada.'||md5(id)||'@example.test', password_hash=NULL, status='DISABLED', updated_at=now()
WHERE email NOT LIKE '%@example.test'
  AND person_id IN (SELECT id FROM persons WHERE organization_id=(SELECT org FROM qa_scope));
-- step
CREATE TEMP TABLE qa_people ON COMMIT DROP AS
WITH targets(status, goal, start_id) AS (
  VALUES ('ACTIVE',400,0), ('INACTIVE',250,400), ('PENDING_ADMISSION',100,650)
), names AS (
  SELECT ARRAY['Ana','André','Beatriz','Bruno','Camila','Carlos','Clara','Daniel','Débora','Eduardo','Elisa','Felipe','Gabriel','Helena','Isabela','João','Juliana','Lucas','Luísa','Marcos','Mariana','Mateus','Paulo','Renata','Sofia'] AS first,
         ARRAY['Almeida','Araújo','Azevedo','Barbosa','Barros','Batista','Cardoso','Carvalho','Castro','Cavalcante','Costa','Dias','Duarte','Ferreira','Freitas','Gomes','Lima','Lopes','Martins','Mendes','Moreira','Nascimento','Nunes','Oliveira','Pereira','Ramos','Ribeiro','Rocha','Santos','Silva','Souza','Teixeira','Vieira'] AS last
), numbered AS (
  SELECT t.status,n,t.start_id+n AS i FROM qa_scope s CROSS JOIN targets t
  CROSS JOIN LATERAL generate_series(1,greatest(0,t.goal-(
    SELECT count(*)::int FROM church_memberships v WHERE v.church_id=s.church
      AND v.status::text=t.status AND v.id NOT LIKE 'qa_rf1_v_%'
  ))) n
)
SELECT status,n,'qa_rf1_p_'||i AS person,'qa_rf1_v_'||i AS membership,'qa_rf1_f_'||((i-1)/4) AS family,
       first[1+((i-1)%25)] AS first_name,
       last[1+(((i-1)/4)%33)]||' '||last[1+(((i-1)/52+8)%33)] AS family_name
FROM numbered CROSS JOIN names;
-- step
INSERT INTO households (id,organization_id,church_id,label,updated_at)
SELECT p.family,s.org,s.church,'Família '||min(p.family_name),now()
FROM qa_people p CROSS JOIN qa_scope s GROUP BY p.family,s.org,s.church ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO persons (id,organization_id,home_church_id,household_id,display_name,email,status,kind,updated_at)
SELECT p.person,s.org,s.church,p.family,p.first_name||' '||p.family_name,p.person||'@example.test',
       (CASE WHEN p.status='INACTIVE' THEN 'INACTIVE' ELSE 'ACTIVE' END)::"PersonStatus",
       (CASE WHEN p.status='PENDING_ADMISSION' THEN 'VISITOR' ELSE 'MEMBER' END)::"PersonKind",now()
FROM qa_people p CROSS JOIN qa_scope s ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO church_memberships (id,person_id,church_id,organization_id,status,joined_at,left_at,updated_at)
SELECT p.membership,p.person,s.church,s.org,p.status::"MembershipStatus",
       now()-make_interval(days=>30+(p.n*13)%1400),
       CASE WHEN p.status='INACTIVE' THEN now()-make_interval(days=>p.n%20) END,now()
FROM qa_people p CROSS JOIN qa_scope s ON CONFLICT (person_id,church_id) DO NOTHING;
-- step
WITH missing AS (
  SELECT v.*, (row_number() OVER (ORDER BY v.id))::int AS n
  FROM church_memberships v JOIN qa_scope s ON s.church=v.church_id
  WHERE v.status='PENDING_ADMISSION' AND NOT EXISTS (
    SELECT 1 FROM admission_protocols a WHERE a.church_id=v.church_id AND a.person_id=v.person_id
    AND a.status IN ('DRAFT','AWAITING_DOCUMENTS','AWAITING_SECRETARIA','AWAITING_PASTOR'))
)
INSERT INTO admission_protocols
  (id,person_id,membership_id,organization_id,church_id,status,modality,current_step,modality_recorded,
   documents_complete,secretaria_approved,created_at,updated_at)
SELECT 'qa_rf1_adm_'||id,person_id,id,organization_id,church_id,
       (ARRAY['AWAITING_DOCUMENTS','AWAITING_SECRETARIA','AWAITING_PASTOR','DRAFT'])[1+n%4]::"AdmissionStatus",
       (CASE WHEN n%4<>3 THEN (ARRAY['BATISMO','TRANSFERENCIA','RECONCILIACAO'])[1+n%3] END)::"AdmissionModality",
       (ARRAY['documents','secretaria','pastor','modality'])[1+n%4]::"AdmissionStep",
       n%4<>3,n%4 IN (1,2),n%4=2,now()-make_interval(days=>n%21),now()
FROM missing ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO admission_protocols
  (id,person_id,membership_id,organization_id,church_id,status,modality,current_step,modality_recorded,
   documents_complete,secretaria_approved,pastor_approved,created_at,updated_at)
SELECT 'qa_rf1_ok_'||v.id,v.person_id,v.id,s.org,s.church,'APPROVED','BATISMO','pastor',true,true,true,true,v.joined_at,v.joined_at
FROM church_memberships v JOIN qa_scope s ON s.church=v.church_id
WHERE v.id LIKE 'qa_rf1_v_%' AND v.status='ACTIVE' ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO member_credentials
  (id,membership_id,person_id,church_id,organization_id,opaque_token,issued_by_user_id,updated_at)
SELECT 'qa_rf1_card_'||p.n,p.membership,p.person,s.church,s.org,
       replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),s.actor,now()
FROM qa_people p CROSS JOIN qa_scope s WHERE p.status='ACTIVE' AND p.n%3<>0 ON CONFLICT (id) DO NOTHING;
-- step
CREATE TEMP TABLE qa_ministries ON COMMIT DROP AS
SELECT m.id,m.slug,m.name,s.org,s.church,s.actor,row_number() OVER (ORDER BY m.slug)::int AS position
FROM ministries m JOIN qa_scope s ON s.church=m.church_id WHERE m.publish_status<>'ARCHIVED';
-- step
CREATE TEMP TABLE qa_teams ON COMMIT DROP AS
SELECT m.*,g.slot_no AS slot,p.person FROM qa_ministries m CROSS JOIN generate_series(1,30) g(slot_no)
JOIN qa_people p ON p.n=((m.position-1)*45+g.slot_no-1)%300+1 AND p.status='ACTIVE';
-- step
INSERT INTO ministry_memberships (id,organization_id,church_id,ministry_id,person_id,role,status,source,updated_at)
SELECT 'qa_rf1_team_'||t.position||'_'||t.slot,t.org,t.church,t.id,t.person,
       CASE WHEN t.slot=1 THEN 'LIDER' WHEN t.slot<=3 THEN 'COORDENADOR' WHEN t.slot%5=0 THEN 'APOIO' ELSE 'INTEGRANTE' END,
       CASE WHEN t.slot=29 THEN 'CONVIDADO' WHEN t.slot=30 THEN 'PAUSADO' ELSE 'ATIVO' END,'DIRETO',now()
FROM qa_teams t ON CONFLICT (ministry_id,person_id) DO NOTHING;
-- step
CREATE TEMP TABLE qa_rosters ON COMMIT DROP AS
SELECT m.*,w AS week,'qa_rf1_roster_'||m.position||'_'||w AS roster,
       date_trunc('week',current_date::timestamp)+make_interval(days=>7*(w-2)+m.position-1,hours=>22) AS service,
       CASE m.slug WHEN 'atmosfera' THEN 'Recepção do culto' WHEN 'louvor-demo' THEN 'Louvor do culto'
       WHEN 'homens' THEN 'Encontro de homens' WHEN 'mulheres' THEN 'Encontro de mulheres'
       WHEN 'jovens' THEN 'Encontro de jovens' ELSE 'Encontro de adolescentes' END AS title
FROM qa_ministries m CROSS JOIN generate_series(1,8) w;
-- step
INSERT INTO rosters (id,organization_id,church_id,ministry_id,title,service_at,status,updated_at)
SELECT roster,org,church,id,title,service,
       (CASE WHEN week=1 THEN 'CLOSED' WHEN week=8 THEN 'DRAFT' ELSE 'PUBLISHED' END)::"RosterStatus",now()
FROM qa_rosters ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO roster_slots (id,roster_id,role_label,sort_order)
SELECT r.roster||'_slot_'||n,r.roster,
       (CASE WHEN r.slug='louvor-demo' THEN ARRAY['Vocal','Teclado','Violão','Bateria','Técnica','Apoio']
        ELSE ARRAY['Coordenação','Acolhimento','Apoio de sala','Organização','Comunicação','Acompanhamento'] END)[n],n
FROM qa_rosters r CROSS JOIN generate_series(1,6) n ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO roster_assignments (id,slot_id,person_id,status,confirmed_at,updated_at)
SELECT r.roster||'_assignment_'||n,r.roster||'_slot_'||n,t.person,
       (CASE WHEN r.week=8 OR (r.week>1 AND n%3=0) THEN 'PENDING' ELSE 'CONFIRMED' END)::"RosterAssignmentStatus",
       CASE WHEN r.week<8 AND (r.week=1 OR n%3<>0) THEN now() END,now()
FROM qa_rosters r CROSS JOIN generate_series(1,6) n
JOIN qa_teams t ON t.id=r.id AND t.slot=((r.week-1)*5+n-1)%28+1 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO portal_events (id,organization_id,church_id,ministry_id,name,slug,starts_at,ends_at,location_text,status,published_at,updated_at)
SELECT 'qa_rf1_event_'||position||'_'||week,org,church,id,title,'qa-rf1-'||position||'-'||week,
       service,service+interval '2 hours',CASE WHEN position%2=0 THEN 'Salão principal' ELSE 'Sala de comunhão' END,
       'PUBLISHED',now(),now() FROM qa_rosters WHERE week BETWEEN 3 AND 6 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO cost_centers (id,organization_id,church_id,code,name,updated_at)
SELECT 'qa_rf1_cc_'||position,org,church,'MIN:'||id,name,now() FROM qa_ministries ON CONFLICT (church_id,code) DO NOTHING;
-- step
INSERT INTO ledger_accounts (id,organization_id,church_id,code,name,type,updated_at)
SELECT 'qa_rf1_account_'||a.code,s.org,s.church,'QA-'||a.code,a.name,a.type::"LedgerAccountType",now()
FROM qa_scope s CROSS JOIN (VALUES ('CAIXA','Caixa dos ministérios','ASSET'),
  ('OFERTAS','Ofertas dos ministérios','REVENUE'),('DESPESAS','Despesas dos ministérios','EXPENSE')) a(code,name,type)
ON CONFLICT (church_id,code) DO NOTHING;
-- step
CREATE TEMP TABLE qa_entries ON COMMIT DROP AS
SELECT 'qa_rf1_ledger_'||m.position||'_'||n AS entry_id,m.org,m.church,m.actor,cc.id AS center,n%2=1 AS income,
       current_date-(25-n*2) AS entry_date,
       CASE WHEN n%2=1 THEN 61000+m.position*9500+n*2300 ELSE 22000+m.position*2400+n*1100 END AS cents,
       CASE WHEN n%2=1 THEN 'Oferta para '||m.name ELSE 'Material e apoio — '||m.name END AS description
FROM qa_ministries m CROSS JOIN generate_series(1,12) n JOIN cost_centers cc ON cc.church_id=m.church AND cc.code='MIN:'||m.id;
-- step
INSERT INTO ledger_entries (id,organization_id,church_id,entry_date,description,status,amount_cents,created_by_user_id,
  submitted_at,first_approved_by_user_id,first_approved_at,cost_center_id,competence_year,competence_month,updated_at)
SELECT entry_id,org,church,entry_date,description,'APPROVED',cents,actor,
       entry_date,actor,entry_date,center,extract(year FROM entry_date),extract(month FROM entry_date),now()
FROM qa_entries ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO ledger_entry_lines (id,entry_id,account_id,side,amount_cents)
SELECT e.entry_id||'_'||x.side,e.entry_id,
       'qa_rf1_account_'||CASE WHEN e.income AND x.side='CREDIT' THEN 'OFERTAS'
                             WHEN NOT e.income AND x.side='DEBIT' THEN 'DESPESAS' ELSE 'CAIXA' END,
       x.side::"LedgerLineSide",e.cents
FROM qa_entries e CROSS JOIN (VALUES ('DEBIT'),('CREDIT')) x(side) ON CONFLICT (id) DO NOTHING;
-- step
DO $$
DECLARE totals int[];
BEGIN
  SELECT ARRAY[count(*) FILTER (WHERE v.status='ACTIVE'),count(*) FILTER (WHERE v.status='INACTIVE'),
               count(*) FILTER (WHERE v.status='PENDING_ADMISSION')]::int[] INTO totals
  FROM church_memberships v JOIN qa_scope s ON s.church=v.church_id;
  IF totals<>ARRAY[400,250,100] THEN RAISE EXCEPTION 'Totais inesperados: %',totals; END IF;
  IF (SELECT count(*) FROM admission_protocols a JOIN qa_scope s ON s.church=a.church_id
      WHERE a.status IN ('DRAFT','AWAITING_DOCUMENTS','AWAITING_SECRETARIA','AWAITING_PASTOR'))<>100
  THEN RAISE EXCEPTION 'São esperadas 100 admissões abertas'; END IF;
  IF EXISTS (
    SELECT e.entry_id FROM qa_entries e LEFT JOIN ledger_entry_lines l ON e.entry_id=l.entry_id
    GROUP BY e.entry_id HAVING sum(CASE WHEN side='DEBIT' THEN amount_cents ELSE -amount_cents END)<>0 OR count(l.id)<>2
  ) THEN RAISE EXCEPTION 'Partida dobrada incompleta'; END IF;
END
$$;
