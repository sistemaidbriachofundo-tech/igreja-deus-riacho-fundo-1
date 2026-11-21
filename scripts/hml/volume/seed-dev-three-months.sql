-- Massa fictícia de setembro a novembro de 2026, com IDs estáveis.
-- Execute os blocos separados por "-- step" em uma única transação.
DO $$
BEGIN
  IF NOT (
    (current_database() = 'idriacho1_hml' AND current_setting('neon.branch_id', true) = 'br-twilight-bonus-b6moawk7') OR
    (current_database() = 'rf1qa' AND inet_server_addr() = '127.0.0.1'::inet)
  ) IS TRUE THEN RAISE EXCEPTION 'Esta massa só pode ser carregada no DEV isolado ou no teste local'; END IF;
END $$;
-- step
SELECT pg_advisory_xact_lock(hashtext('idbrf.qa3.rf1'));
-- step
CREATE TEMP TABLE qa3_scope ON COMMIT DROP AS
SELECT c.organization_id AS org,c.id AS church,d.id AS destination,
  (SELECT id FROM users WHERE email='platform.demo@example.test') AS admin,
  (SELECT id FROM users WHERE email='ana.demo@example.test') AS secretary,
  (SELECT id FROM users WHERE email='pastor.demo@example.test') AS pastor,
  (SELECT id FROM users WHERE email='tesouraria.demo@example.test') AS treasurer,
  (SELECT person_id FROM users WHERE email='bruno.demo@example.test') AS demo_member,
  (SELECT id FROM discipleship_tracks WHERE church_id=c.id AND code='conexao' LIMIT 1) AS connection_track
FROM churches c JOIN organizations o ON o.id=c.organization_id
JOIN churches d ON d.organization_id=c.organization_id AND d.slug='riacho-fundo-2-demo'
WHERE o.slug='igreja-de-deus' AND c.slug='riacho-fundo-1';
-- step
DO $$
BEGIN
  IF (SELECT count(*) FROM qa3_scope WHERE admin IS NOT NULL AND secretary IS NOT NULL AND pastor IS NOT NULL
        AND treasurer IS NOT NULL AND demo_member IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'Congregação fictícia ou contas de demonstração indisponíveis';
  END IF;
END $$;
-- step
CREATE TEMP TABLE qa3_calendar ON COMMIT DROP AS
SELECT month_no AS m, make_date(2026, month_no, 1) AS start_day,
  (make_date(2026, month_no, 1) + interval '1 month - 1 day')::date AS end_day
FROM generate_series(9,11) month_no;
-- step
CREATE TEMP TABLE qa3_people ON COMMIT DROP AS
SELECT q.*,i,'rf1qa3-person-'||m||'-'||i AS person,'rf1qa3-member-'||m||'-'||i AS membership,
       'rf1qa3-family-'||m||'-'||(1+(i-1)/4) AS family,
       (ARRAY['Alex','Bianca','Caio','Diana','Elias','Flávia','Gustavo','Helena','Íris','João','Lia','Marcos','Nina','Otávio','Paula','Raul','Sara','Tomás'])[i] AS first_name,
       start_day + (1+(i*3)%15) AS registered_on
FROM qa3_calendar q CROSS JOIN generate_series(1,18) i;
-- step
INSERT INTO households (id,organization_id,church_id,label,created_at,updated_at)
SELECT DISTINCT family,org,church,'TESTE 3M · Família '||m||'/'||(1+(i-1)/4),start_day,start_day
FROM qa3_people CROSS JOIN qa3_scope ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO persons (id,organization_id,home_church_id,household_id,display_name,email,birth_date,baptism_date,
  wedding_date,first_attended_on,sex,status,kind,is_minor,legal_guardian_person_id,created_at,updated_at)
SELECT p.person,s.org,CASE WHEN p.i=17 THEN s.destination ELSE s.church END,p.family,'TESTE 3M · '||p.first_name||' Fictício '||p.m||'-'||p.i,
  p.person||'@example.test',
  CASE WHEN p.m=11 THEN make_date(CASE WHEN p.i IN (9,10) THEN 2013 ELSE 1979+p.i END,11,least(28,17+p.i))
       ELSE make_date(CASE WHEN p.i IN (9,10) THEN 2013 ELSE 1979+p.i END,p.m,least(28,5+p.i)) END,
  CASE WHEN p.i<=8 THEN (p.registered_on-interval '2 years')::date END,
  CASE WHEN p.i IN (1,4) THEN (p.registered_on-interval '4 years')::date END,
  (p.registered_on-interval '3 years')::date,
  (CASE WHEN p.i%2=0 THEN 'FEMALE' ELSE 'MALE' END)::"PersonSex",
  (CASE WHEN p.i=16 THEN 'INACTIVE' ELSE 'ACTIVE' END)::"PersonStatus",
  (CASE WHEN p.i<=10 OR p.i IN (16,17) THEN 'MEMBER' ELSE 'VISITOR' END)::"PersonKind",
  p.i IN (9,10),CASE WHEN p.i IN (9,10) THEN 'rf1qa3-person-'||p.m||'-1' END,
  p.registered_on,p.registered_on + interval '6 hours'
FROM qa3_people p CROSS JOIN qa3_scope s ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO church_memberships (id,person_id,church_id,organization_id,status,joined_at,left_at,notes,ecclesiastical_roles,created_at,updated_at)
SELECT membership,person,church,org,
  (CASE WHEN i<=10 THEN 'ACTIVE' WHEN i<=15 THEN 'PENDING_ADMISSION' WHEN i=16 THEN 'INACTIVE' ELSE 'TRANSFERRED' END)::"MembershipStatus",
  registered_on,CASE WHEN i=17 THEN registered_on+3 END,'Ficha inteiramente fictícia para testes de DEV.',
  CASE i WHEN 1 THEN ARRAY['PASTOR']::"EcclesiasticalRole"[] WHEN 2 THEN ARRAY['EVANGELIST']::"EcclesiasticalRole"[]
    WHEN 3 THEN ARRAY['DEACON','MINISTRY_LEADER']::"EcclesiasticalRole"[] WHEN 4 THEN ARRAY['DEACON']::"EcclesiasticalRole"[]
    ELSE ARRAY[]::"EcclesiasticalRole"[] END,registered_on,registered_on
FROM qa3_people CROSS JOIN qa3_scope WHERE i<=17 ON CONFLICT (person_id,church_id) DO NOTHING;
-- step
INSERT INTO church_memberships (id,person_id,church_id,organization_id,status,joined_at,created_at,updated_at)
SELECT membership||'-destination',person,destination,org,'ACTIVE',registered_on+3,registered_on+3,registered_on+3
FROM qa3_people CROSS JOIN qa3_scope WHERE i=17 ON CONFLICT (person_id,church_id) DO NOTHING;
-- step
INSERT INTO admission_protocols (id,person_id,membership_id,organization_id,church_id,status,modality,current_step,modality_recorded,
  documents_complete,secretaria_approved,pastor_approved,notes,rejection_reason,created_at,updated_at)
SELECT 'rf1qa3-admission-'||m||'-'||i,person,membership,org,church,
  (CASE WHEN i<=8 THEN 'APPROVED' WHEN i=11 THEN 'DRAFT' WHEN i=12 THEN 'AWAITING_DOCUMENTS'
    WHEN i=13 THEN 'AWAITING_SECRETARIA' WHEN i=14 THEN 'AWAITING_PASTOR' ELSE 'REJECTED' END)::"AdmissionStatus",
  CASE WHEN i<>11 THEN (ARRAY['BATISMO','TRANSFERENCIA','RECONCILIACAO'])[1+i%3]::"AdmissionModality" END,
  (CASE WHEN i<=8 OR i IN (14,15) THEN 'pastor' WHEN i=11 THEN 'modality' WHEN i=12 THEN 'documents' ELSE 'secretaria' END)::"AdmissionStep",
  i<>11,i<=8 OR i>=13,i<=8 OR i>=14,i<=8,'TESTE 3M · protocolo fictício',
  CASE WHEN i=15 THEN 'Encerramento fictício para testar o histórico.' END,registered_on,registered_on+1
FROM qa3_people CROSS JOIN qa3_scope WHERE i<=8 OR i BETWEEN 11 AND 15 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO audit_logs (id,actor_user_id,organization_id,church_id,action,resource_type,resource_id,metadata,created_at)
SELECT 'rf1qa3-admit-log-'||m||'-'||i,pastor,org,church,'admission.advance','admission','rf1qa3-admission-'||m||'-'||i,
  jsonb_build_object('status','APPROVED','fixture','rf1qa3'),registered_on+1
FROM qa3_people CROSS JOIN qa3_scope WHERE i<=8 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO membership_transfers (id,person_id,organization_id,from_church_id,to_church_id,from_membership_id,to_membership_id,
  status,notes,requested_by_user_id,approved_origin_at,approved_dest_at,completed_at,created_at,updated_at)
SELECT 'rf1qa3-transfer-'||m||'-'||i,person,org,church,destination,membership,
  CASE WHEN i=17 THEN membership||'-destination' END,
  (CASE WHEN i=17 THEN 'COMPLETED' ELSE 'AWAITING_ORIGIN' END)::"TransferStatus",'TESTE 3M · transferência fictícia',secretary,
  CASE WHEN i=17 THEN registered_on+1 END,CASE WHEN i=17 THEN registered_on+2 END,CASE WHEN i=17 THEN registered_on+3 END,
  registered_on,CASE WHEN i=17 THEN registered_on+3 ELSE registered_on END
FROM qa3_people CROSS JOIN qa3_scope WHERE i IN (8,17) ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO member_credentials (id,membership_id,person_id,church_id,organization_id,status,opaque_token,issued_at,revoked_at,issued_by_user_id,created_at,updated_at)
SELECT 'rf1qa3-credential-'||m||'-'||i,membership,person,church,org,
  (CASE WHEN i=8 THEN 'REVOKED' ELSE 'ACTIVE' END)::"CredentialStatus",
  replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),registered_on+1,
  CASE WHEN i=8 THEN registered_on+2 END,secretary,registered_on+1,registered_on+2
FROM qa3_people CROSS JOIN qa3_scope WHERE i BETWEEN 1 AND 8 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO church_letters (id,organization_id,church_id,person_id,letter_type,status,title,body_text,created_at,updated_at)
SELECT 'rf1qa3-letter-'||m||'-'||i,org,church,person,(CASE WHEN i=1 THEN 'MEMBRESIA' ELSE 'RECOMENDACAO' END)::"ChurchLetterType",
  'DRAFT','TESTE 3M · Minuta de carta','Carta fictícia para testar edição, emissão e PDF no DEV.',registered_on,registered_on
FROM qa3_people CROSS JOIN qa3_scope WHERE i IN (1,2) ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO pastoral_cases (id,organization_id,church_id,person_id,kind,status,title,summary,assigned_to_user_id,
  created_by_user_id,due_at,closed_at,created_at,updated_at)
SELECT 'rf1qa3-care-'||m||'-'||i,org,church,person,(ARRAY['ACOLHIMENTO','VISITA','ORACAO'])[i]::"PastoralCaseKind",
  (ARRAY['OPEN','IN_PROGRESS','DONE'])[i]::"PastoralCaseStatus",'TESTE 3M · Cuidado '||m||'/'||i,
  'Atendimento inteiramente fictício, sem informação pastoral real.',pastor,pastor,registered_on+5,
  CASE WHEN i=3 THEN registered_on+4 END,registered_on,registered_on+4
FROM qa3_people CROSS JOIN qa3_scope WHERE i<=3 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO pastoral_tasks (id,case_id,title,done,due_at,created_at,updated_at)
SELECT id||'-task',id,'TESTE 3M · Registrar retorno',status='DONE',due_at,created_at,updated_at
FROM pastoral_cases WHERE id LIKE 'rf1qa3-care-%' ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO ministries (id,organization_id,church_id,leader_person_id,name,slug,description,visibility,publish_status,created_at,updated_at)
SELECT 'rf1qa3-ministry-'||p.m,s.org,s.church,p.person,
  'TESTE 3M · '||(ARRAY['Acolhimento','Famílias','Ação Social'])[p.m-8],
  'rf1qa3-ministerio-'||p.m,'Equipe fictícia para testar cadastro, liderança, eventos e custos.',
  'INTERNAL','DRAFT',p.start_day,p.start_day
FROM qa3_people p CROSS JOIN qa3_scope s WHERE p.i=3 ON CONFLICT (id) DO NOTHING;
-- step
CREATE TEMP TABLE qa3_teams ON COMMIT DROP AS
SELECT 'rf1qa3-ministry-'||p.m AS ministry,p.*,s.org,s.church FROM qa3_people p CROSS JOIN qa3_scope s WHERE p.i BETWEEN 3 AND 8
UNION ALL
SELECT m.id,p.*,s.org,s.church FROM qa3_people p CROSS JOIN qa3_scope s
JOIN ministries m ON m.church_id=s.church AND m.slug='atmosfera' WHERE p.i BETWEEN 3 AND 8;
-- step
INSERT INTO ministry_memberships (id,organization_id,church_id,ministry_id,person_id,role,status,source,started_at,created_at,updated_at)
SELECT 'rf1qa3-team-'||md5(ministry||':'||person),org,church,ministry,person,
  CASE i WHEN 3 THEN 'LIDER' WHEN 4 THEN 'COORDENADOR' WHEN 8 THEN 'APOIO' ELSE 'INTEGRANTE' END,
  CASE i WHEN 7 THEN 'CONVIDADO' WHEN 8 THEN 'PAUSADO' ELSE 'ATIVO' END,'DIRETO',registered_on,registered_on,registered_on
FROM qa3_teams ON CONFLICT (ministry_id,person_id) DO NOTHING;
-- step
INSERT INTO volunteer_interests (id,organization_id,church_id,ministry_id,display_name,email,person_id,stage,status,message,created_at,updated_at)
SELECT 'rf1qa3-interest-'||t.m||'-'||t.i,t.org,t.church,t.ministry,p.display_name,p.email,t.person,
   (ARRAY['INTERESSE','AVALIACAO','APROVACAO','EQUIPE','DISPONIBILIDADE','ESCALA'])[t.i-2]::"VolunteerJourneyStage",
   (CASE WHEN t.i=4 THEN 'REJECTED' WHEN t.i=8 THEN 'CLOSED' ELSE 'OPEN' END)::"VolunteerInterestStatus",
   'TESTE 3M · Interesse fictício em servir.',t.registered_on,t.registered_on
FROM qa3_teams t JOIN persons p ON p.id=t.person
WHERE t.ministry LIKE 'rf1qa3-ministry-%' ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO volunteer_availabilities (id,organization_id,church_id,person_id,weekday,start_minute,end_minute,notes,active,created_at,updated_at)
SELECT 'rf1qa3-vol-'||p.m||'-'||p.i||'-'||d.day,s.org,s.church,p.person,d.day,d.start_at,d.finish_at,
  'TESTE 3M · horário fictício',true,p.start_day,p.start_day
FROM qa3_people p CROSS JOIN qa3_scope s CROSS JOIN (VALUES (0,540,750),(4,1110,1320)) d(day,start_at,finish_at)
WHERE i BETWEEN 3 AND 8 ON CONFLICT DO NOTHING;
-- step
INSERT INTO volunteer_impediments (id,organization_id,church_id,person_id,starts_at,ends_at,reason,created_by_user_id,created_at,updated_at)
SELECT 'rf1qa3-impediment-'||m,org,church,person,start_day+interval '21 days',start_day+interval '23 days',
  'TESTE 3M · indisponibilidade fictícia',admin,start_day,start_day
FROM qa3_people CROSS JOIN qa3_scope WHERE i=5 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO small_groups (id,organization_id,church_id,name,leader_person_id,meets_at_hint,meeting_address,public_listed,created_at,updated_at)
SELECT 'rf1qa3-group-'||p.m,s.org,s.church,'TESTE 3M · Grupo de Amizade '||(ARRAY['Ipê','Copaíba','Manacá'])[p.m-8],
  p.person,'Sextas às 19h30','Quadra fictícia, Riacho Fundo I',p.m=11,p.start_day,p.start_day
FROM qa3_people p CROSS JOIN qa3_scope s WHERE p.i=2 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO small_group_members (id,group_id,person_id,role,joined_at)
SELECT 'rf1qa3-group-member-'||m||'-'||i,'rf1qa3-group-'||m,person,
  (CASE WHEN i=2 THEN 'LEADER' ELSE 'MEMBER' END)::"SmallGroupMemberRole",registered_on
FROM qa3_people WHERE i BETWEEN 2 AND 5 ON CONFLICT (group_id,person_id) DO NOTHING;
-- step
INSERT INTO small_group_join_requests (id,group_id,person_id,status,created_at)
SELECT 'rf1qa3-join-'||m||'-'||i,'rf1qa3-group-'||m,person,
  (CASE WHEN i=5 THEN 'APPROVED' WHEN i=6 THEN 'PENDING' ELSE 'DECLINED' END)::"SmallGroupJoinStatus",registered_on
FROM qa3_people WHERE i BETWEEN 5 AND 7 ON CONFLICT DO NOTHING;
-- step
INSERT INTO group_meetings (id,group_id,occurred_at,notes,created_at)
SELECT 'rf1qa3-meeting-'||m||'-'||n,'rf1qa3-group-'||m,start_day+(3+n*7)+time '22:30',
  'TESTE 3M · encontro e presença fictícios',start_day+(3+n*7)
FROM qa3_calendar CROSS JOIN generate_series(0,2) n ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO group_meeting_attendances (id,meeting_id,person_id,present)
SELECT 'rf1qa3-attendance-'||m||'-'||i||'-'||n,'rf1qa3-meeting-'||m||'-'||n,person,(i+n)%4<>0
FROM qa3_people CROSS JOIN generate_series(0,2) n WHERE i BETWEEN 2 AND 5 ON CONFLICT DO NOTHING;
-- step
INSERT INTO discipleship_tracks (id,organization_id,church_id,name,description,created_at,updated_at)
SELECT 'rf1qa3-track',org,church,'TESTE 3M · Primeiros passos','Trilha fictícia para testar criação e progresso de etapas.',
  DATE '2026-09-01',DATE '2026-09-01' FROM qa3_scope ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO discipleship_track_stages (id,track_id,sort_order,code,title,description,created_at,updated_at)
SELECT 'rf1qa3-stage-'||n,'rf1qa3-track',n,'qa3-etapa-'||n,title,'Etapa fictícia para o ambiente de DEV.',
  DATE '2026-09-01',DATE '2026-09-01'
FROM (VALUES (1,'Boas-vindas'),(2,'Vida em comunidade'),(3,'Servir com propósito')) a(n,title) ON CONFLICT (id) DO NOTHING;
-- step
CREATE TEMP TABLE qa3_learning ON COMMIT DROP AS
SELECT p.*,v.track,(SELECT count(*)::int FROM discipleship_track_stages WHERE track_id=v.track) AS stage_count,
  'rf1qa3-enrollment-'||m||'-'||i AS enrollment,
  CASE WHEN i=8 THEN NULL ELSE 'rf1qa3-person-'||m||'-2' END AS mentor
FROM qa3_people p CROSS JOIN qa3_scope s
CROSS JOIN LATERAL (SELECT CASE WHEN i=8 THEN 'rf1qa3-track' ELSE coalesce(s.connection_track,'rf1qa3-track') END AS track) v
WHERE i BETWEEN 4 AND 8;
-- step
INSERT INTO discipleship_mentor_registrations (track_id,person_id,created_at)
SELECT DISTINCT track,mentor,start_day FROM qa3_learning WHERE mentor IS NOT NULL ON CONFLICT DO NOTHING;
-- step
INSERT INTO discipleship_enrollments (id,track_id,person_id,mentor_person_id,status,started_at,completed_at,created_at,updated_at)
SELECT enrollment,track,person,mentor,
  (CASE WHEN i=4 AND stage_count>0 THEN 'COMPLETED' WHEN i=6 THEN 'PAUSED' WHEN i=7 THEN 'CANCELLED' ELSE 'ACTIVE' END)::"DiscipleshipEnrollmentStatus",
  registered_on,CASE WHEN i=4 AND stage_count>0 THEN registered_on+6 END,registered_on,registered_on+6
FROM qa3_learning ON CONFLICT DO NOTHING;
-- step
INSERT INTO discipleship_progress_events (id,enrollment_id,stage_id,kind,note,recorded_by_user_id,recorded_at,created_at)
SELECT l.enrollment||'-progress-'||st.n,l.enrollment,st.id,'COMPLETED','TESTE 3M · etapa fictícia concluída',
  s.pastor,l.registered_on+least(st.n,5)::int,l.registered_on+least(st.n,5)::int
FROM qa3_learning l CROSS JOIN qa3_scope s
CROSS JOIN LATERAL (SELECT id,row_number() OVER (ORDER BY sort_order,id) AS n FROM discipleship_track_stages WHERE track_id=l.track) st
WHERE l.i=4 OR (l.i IN (5,6) AND st.n=1)
ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO discipleship_enrollments (id,track_id,person_id,mentor_person_id,status,started_at,created_at,updated_at)
SELECT 'rf1qa3-enrollment-demo',coalesce(connection_track,'rf1qa3-track'),demo_member,'rf1qa3-person-11-2','ACTIVE',
  DATE '2026-11-12',DATE '2026-11-12',DATE '2026-11-12'
FROM qa3_scope ON CONFLICT DO NOTHING;
-- step
INSERT INTO cost_centers (id,organization_id,church_id,code,name,created_at,updated_at)
SELECT 'rf1qa3-center-'||q.m,s.org,s.church,'MIN:rf1qa3-ministry-'||q.m,'TESTE 3M · Centro de custo '||q.m,
  q.start_day,q.start_day FROM qa3_calendar q CROSS JOIN qa3_scope s ON CONFLICT (church_id,code) DO NOTHING;
-- step
INSERT INTO funds (id,organization_id,church_id,code,name,created_at,updated_at)
SELECT 'rf1qa3-fund',org,church,'QA3-ACAO','TESTE 3M · Fundo de apoio',DATE '2026-09-01',DATE '2026-09-01'
FROM qa3_scope ON CONFLICT (church_id,code) DO NOTHING;
-- step
INSERT INTO ledger_accounts (id,organization_id,church_id,code,name,type,created_at,updated_at)
SELECT 'rf1qa3-account-'||replace(a.code,'.','-'),s.org,s.church,a.code,a.name,a.type::"LedgerAccountType",
  DATE '2026-09-01',DATE '2026-09-01'
FROM qa3_scope s CROSS JOIN (VALUES
  ('1.1.10.933','TESTE 3M · Banco BRB fictício','ASSET'),
  ('1.1.10.934','TESTE 3M · Banco Sicoob fictício','ASSET'),
  ('1.1.10.935','TESTE 3M · Mercado Pago fictício','ASSET'),
  ('1.1.01.933','TESTE 3M · Caixa em dinheiro','ASSET'),
  ('1.2.20.01','Cartão a liquidar','ASSET'),
  ('1.2.20.02','Dinheiro a depositar','ASSET'),
  ('2.1.01.933','TESTE 3M · Contas a pagar','LIABILITY'),
  ('4.2.10.01','Ofertas recebidas via Pix','REVENUE'),
  ('4.2.10.02','Ofertas por cartão','REVENUE'),
  ('4.2.10.03','Ofertas em dinheiro','REVENUE'),
  ('5.1.933','TESTE 3M · Despesas de apoio','EXPENSE')
) a(code,name,type) ON CONFLICT (church_id,code) DO NOTHING;
-- step
INSERT INTO church_receiving_accounts (id,organization_id,church_id,ledger_account_id,display_name,pix_key,merchant_city,active,created_at,updated_at)
SELECT 'rf1qa3-receiving',s.org,s.church,a.id,'TESTE 3M · Pix fictício DEV','rf1qa3-pix@example.test','Brasilia',true,
  DATE '2026-09-01',DATE '2026-09-01'
FROM qa3_scope s JOIN ledger_accounts a ON a.church_id=s.church AND a.id='rf1qa3-account-1-1-10-933'
ON CONFLICT (ledger_account_id) DO NOTHING;
-- step
INSERT INTO reconciliations (id,organization_id,church_id,title,period_start,period_end,status,notes,
  created_by_user_id,first_approved_by_user_id,first_approved_at,second_approved_by_user_id,second_approved_at,
  closed_at,created_at,updated_at)
SELECT 'rf1qa3-reconcile-'||m,org,church,'TESTE 3M · Conciliação '||m||'/2026',start_day,end_day,
  (ARRAY['CLOSED','PENDING_APPROVAL','OPEN'])[m-8]::"ReconciliationStatus",'Extrato e conferência fictícios.',
  treasurer,CASE WHEN m<11 THEN treasurer END,CASE WHEN m<11 THEN start_day+16 END,
  CASE WHEN m=9 THEN pastor END,CASE WHEN m=9 THEN end_day END,
  CASE WHEN m=9 THEN end_day END,start_day+2,CASE WHEN m=9 THEN end_day ELSE start_day+16 END
FROM qa3_calendar CROSS JOIN qa3_scope ON CONFLICT (id) DO NOTHING;
-- step
CREATE TEMP TABLE qa3_finance ON COMMIT DROP AS
SELECT s.*,q.*,a.*,q.start_day+offset_day AS posted_on,'rf1qa3-entry-'||q.m||'-'||a.n AS entry
FROM qa3_scope s CROSS JOIN qa3_calendar q CROSS JOIN (VALUES
  (1,2,155000,'Oferta Pix do culto','APPROVED','1.1.10.933','4.2.10.01'),
  (2,3,84000,'Oferta no cartão','APPROVED','1.2.20.01','4.2.10.02'),
  (3,4,46000,'Oferta em dinheiro','APPROVED','1.2.20.02','4.2.10.03'),
  (4,5,64000,'Liquidação parcial do cartão','APPROVED','1.1.10.935','1.2.20.01'),
  (5,6,30000,'Depósito parcial de dinheiro','APPROVED','1.1.10.934','1.2.20.02'),
  (6,9,19500,'Baixa em dinheiro de material','APPROVED','2.1.01.933','1.1.01.933'),
  (7,7,19500,'Conta de material já paga','APPROVED','5.1.933','2.1.01.933'),
  (8,8,37200,'Conta de apoio aguardando pagamento','APPROVED','5.1.933','2.1.01.933'),
  (9,10,28700,'Despesa esperando decisão do pastor','PENDING_APPROVAL','5.1.933','1.1.10.933'),
  (10,11,11200,'Despesa devolvida para conferência','REJECTED','5.1.933','1.1.10.934'),
  (11,12,16500,'Lançamento em rascunho','DRAFT','5.1.933','1.1.10.934'),
  (12,13,22500,'Material e apoio ministerial','APPROVED','5.1.933','1.1.10.933'),
  (13,14,5900,'Recebimento Pix fictício do evento','APPROVED','1.1.10.933','4.2.10.01'),
  (14,15,78500,'Oferta Pix em conta do Sicoob','APPROVED','1.1.10.934','4.2.10.01'),
  (15,17,12400,'Despesa com comprovante fictício','PENDING_APPROVAL','5.1.933','1.1.10.933'),
  (16,0,55000,'Suprimento inicial do caixa','APPROVED','1.1.01.933','4.2.10.03')
) a(n,offset_day,cents,description,state,debit,credit);
-- step
INSERT INTO ledger_entries (id,organization_id,church_id,entry_date,description,status,amount_cents,created_by_user_id,
  submitted_at,first_approved_by_user_id,first_approved_at,second_approved_by_user_id,second_approved_at,
  rejected_by_user_id,rejected_at,rejection_reason,reconciliation_id,cost_center_id,fund_id,
  competence_year,competence_month,created_at,updated_at)
SELECT f.entry,f.org,f.church,f.posted_on,'TESTE 3M · '||f.description,f.state::"LedgerEntryStatus",f.cents,f.treasurer,
  CASE WHEN f.state<>'DRAFT' THEN f.posted_on END,CASE WHEN f.state<>'DRAFT' THEN f.treasurer END,
  CASE WHEN f.state<>'DRAFT' THEN f.posted_on END,CASE WHEN f.state='APPROVED' THEN f.pastor END,
  CASE WHEN f.state='APPROVED' THEN f.posted_on END,CASE WHEN f.state='REJECTED' THEN f.pastor END,
  CASE WHEN f.state='REJECTED' THEN f.posted_on END,CASE WHEN f.state='REJECTED' THEN 'TESTE 3M · conferir classificação.' END,
  CASE WHEN f.n=1 THEN 'rf1qa3-reconcile-'||f.m END,cc.id,fd.id,2026,f.m,f.posted_on,f.posted_on
FROM qa3_finance f JOIN cost_centers cc ON cc.church_id=f.church AND cc.code='MIN:rf1qa3-ministry-'||f.m
JOIN funds fd ON fd.church_id=f.church AND fd.code='QA3-ACAO'
ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO ledger_entry_lines (id,entry_id,account_id,side,amount_cents)
SELECT f.entry||'-'||value.side,f.entry,a.id,value.side::"LedgerLineSide",f.cents
FROM qa3_finance f CROSS JOIN LATERAL (VALUES ('DEBIT',f.debit),('CREDIT',f.credit)) value(side,code)
JOIN ledger_accounts a ON a.church_id=f.church AND a.code=value.code ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO audit_logs (id,actor_user_id,organization_id,church_id,action,resource_type,resource_id,metadata,created_at)
SELECT 'rf1qa3-paid-'||m,treasurer,org,church,'ledger.payable.paid','ledger_entry','rf1qa3-entry-'||m||'-7',
  jsonb_build_object('settlementId',entry,'method','CASH','fixture','rf1qa3'),posted_on
FROM qa3_finance WHERE n=6 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO bank_import_batches (id,organization_id,church_id,format,status,adapter,account_id,filename,line_count,created_by_user_id,created_at,updated_at)
SELECT 'rf1qa3-ofx-'||q.m,s.org,s.church,'OFX','PARSED','FILE',a.id,'TESTE-3M-BRB-2026-'||q.m||'.ofx',3,
  s.treasurer,q.start_day+17,q.start_day+17
FROM qa3_calendar q CROSS JOIN qa3_scope s JOIN ledger_accounts a ON a.id='rf1qa3-account-1-1-10-933'
ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO bank_statement_lines (id,batch_id,posted_at,amount_cents,description,external_ref,match_status,matched_entry_id,created_at)
SELECT 'rf1qa3-bankline-'||m||'-'||n,'rf1qa3-ofx-'||m,posted_on,
  CASE WHEN n=12 THEN -cents ELSE cents END,'TESTE 3M · '||description,'rf1qa3-ofx-ref-'||m||'-'||n,
  (CASE WHEN n=1 THEN 'MATCHED' WHEN n=12 THEN 'SUGGESTED' ELSE 'UNMATCHED' END)::"BankLineMatchStatus",
  CASE WHEN n=1 THEN entry END,start_day+17
FROM qa3_finance WHERE n IN (1,12,13) ON CONFLICT DO NOTHING;
-- step
INSERT INTO budgets (id,organization_id,church_id,year,title,status,created_by_user_id,created_at,updated_at)
SELECT 'rf1qa3-budget',org,church,2026,'TESTE 3M · Orçamento de apoio','ACTIVE',treasurer,
  DATE '2026-09-01',DATE '2026-09-01' FROM qa3_scope ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO budget_lines (id,budget_id,account_id,fund_id,cost_center_id,planned_cents,created_at,updated_at)
SELECT 'rf1qa3-budget-line-'||q.m,'rf1qa3-budget',a.id,f.id,c.id,(200000+q.m*5000),q.start_day,q.start_day
FROM qa3_calendar q CROSS JOIN qa3_scope s
JOIN ledger_accounts a ON a.church_id=s.church AND a.code='5.1.933'
JOIN funds f ON f.church_id=s.church AND f.code='QA3-ACAO'
JOIN cost_centers c ON c.church_id=s.church AND c.code='MIN:rf1qa3-ministry-'||q.m
ON CONFLICT (id) DO NOTHING;
-- step
CREATE TEMP TABLE qa3_events ON COMMIT DROP AS
SELECT q.*,s.*,j,'rf1qa3-event-'||q.m||'-'||j AS event,'rf1qa3-event-'||q.m||'-'||j AS slug,
  q.start_day+(ARRAY[5,13,15,21,27,28])[j]+time '22:00' AS starts,
  (CASE WHEN j=3 THEN 'CANCELLED' WHEN j=6 THEN 'DRAFT' ELSE 'PUBLISHED' END)::"PortalEventStatus" AS state,
  (ARRAY['Culto e acolhimento','Oficina com inscrição paga','Encontro cancelado','Encontro de famílias gratuito','Oficina paga','Encontro em preparação'])[j] AS label
FROM qa3_calendar q CROSS JOIN qa3_scope s CROSS JOIN generate_series(1,6) j;
-- step
INSERT INTO portal_events (id,organization_id,church_id,ministry_id,name,slug,description,starts_at,ends_at,location_text,status,
  published_at,cancelled_at,created_at,updated_at)
SELECT event,org,church,'rf1qa3-ministry-'||m,'TESTE 3M · '||label||' ('||m||'/2026)',slug,
  'Evento fictício para validar agenda, inscrições, equipe e presença no DEV.',starts,starts+interval '2 hours','Salão fictício de Riacho Fundo I',state,
  CASE WHEN j<>6 THEN start_day END,CASE WHEN j=3 THEN start_day+7 END,start_day,start_day+3
FROM qa3_events ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO event_modalities (id,event_id,code,name,kind,capacity,min_party_size,max_party_size,sort_order,created_at,updated_at)
SELECT event||'-individual',event,'individual','Individual','INDIVIDUAL',40,1,1,1,start_day,start_day
FROM qa3_events ON CONFLICT (event_id,code) DO NOTHING;
-- step
INSERT INTO event_modalities (id,event_id,code,name,kind,capacity,min_party_size,max_party_size,sort_order,created_at,updated_at)
SELECT event||'-family',event,'familia','Família','FAMILY',20,2,5,2,start_day,start_day
FROM qa3_events WHERE j=4 ON CONFLICT (event_id,code) DO NOTHING;
-- step
INSERT INTO event_lots (id,event_id,modality_id,code,name,capacity,price_cents,opens_at,closes_at,status,receiving_account_id,created_at,updated_at)
SELECT event||'-lot',event,event||'-individual','qa3-lote-1','TESTE 3M · Lote principal',30,
  CASE WHEN j IN (2,5) THEN 5900 ELSE 0 END,start_day,starts-interval '3 hours',
  (CASE WHEN j=6 THEN 'DRAFT' WHEN m=11 AND j IN (4,5) THEN 'OPEN' ELSE 'CLOSED' END)::"EventLotStatus",
  CASE WHEN j IN (2,5) THEN 'rf1qa3-receiving' END,start_day,start_day
FROM qa3_events ON CONFLICT (event_id,code) DO NOTHING;
-- step
INSERT INTO event_lots (id,event_id,modality_id,code,name,capacity,price_cents,opens_at,closes_at,status,created_at,updated_at)
SELECT event||'-family-lot',event,event||'-family','qa3-familia','TESTE 3M · Lote família',8,0,start_day,starts-interval '3 hours',
  (CASE WHEN m=11 THEN 'OPEN' ELSE 'CLOSED' END)::"EventLotStatus",start_day,start_day
FROM qa3_events WHERE j=4 ON CONFLICT (event_id,code) DO NOTHING;
-- step
CREATE TEMP TABLE qa3_reg ON COMMIT DROP AS
SELECT e.*,n,'rf1qa3-registration-'||e.m||'-'||e.j||'-'||n AS reg,
  CASE WHEN n=1 THEN e.demo_member ELSE 'rf1qa3-person-'||e.m||'-'||(n+2) END AS attendee,
  (CASE WHEN j=3 THEN 'CANCELLED' WHEN m=11 AND j=5 AND n<=3 THEN 'PENDING_PAYMENT'
     WHEN (m<11 OR j IN (1,2)) AND n<=4 THEN 'CHECKED_IN' ELSE 'CONFIRMED' END)::"EventRegistrationStatus" AS reg_status,
  (CASE WHEN j=3 THEN 'CANCELLED' WHEN m=11 AND j=5 AND n<=3 THEN 'PENDING'
     WHEN j=2 AND n=1 THEN 'CONFIRMED_PIX' ELSE 'CONFIRMED_MOCK' END)::"EventPaymentStatus" AS payment_status,
  j=4 AND n=4 AS family,
  j=4 AND n IN (7,8) AS minor,
  (CASE WHEN j=4 AND n=7 THEN 'PENDING' WHEN j=4 AND n=8 THEN 'AUTHORIZED' ELSE 'NOT_REQUIRED' END)::"EventGuardianAuthStatus" AS guardian_state
FROM qa3_events e CROSS JOIN generate_series(1,8) n WHERE j<6;
-- step
INSERT INTO event_registrations (id,organization_id,church_id,registrant_person_id,event_id,modality_id,lot_id,display_name,
  notification_email,party_size,is_minor,guardian_display_name,guardian_auth_status,guardian_authorized_at,
  status,payment_status,check_in_code,checked_in_at,cancelled_at,created_at,updated_at)
SELECT r.reg,r.org,r.church,p.id,r.event,r.event||CASE WHEN r.family THEN '-family' ELSE '-individual' END,
  r.event||CASE WHEN r.family THEN '-family-lot' ELSE '-lot' END,
  CASE WHEN r.n=1 THEN 'TESTE 3M · Perfil de membro demo' ELSE p.display_name END,p.email,
  CASE WHEN r.family THEN 3 ELSE 1 END,r.minor,CASE WHEN r.minor THEN 'TESTE 3M · Responsável fictício' END,
  r.guardian_state,CASE WHEN r.guardian_state='AUTHORIZED' THEN r.start_day+3 END,
  r.reg_status,r.payment_status,upper(substr(md5(r.reg),1,12)),CASE WHEN r.reg_status='CHECKED_IN' THEN r.starts END,
  CASE WHEN r.reg_status='CANCELLED' THEN r.start_day+7 END,r.start_day+1,
  CASE WHEN r.reg_status='CHECKED_IN' THEN r.starts WHEN r.reg_status='CANCELLED' THEN r.start_day+7 ELSE r.start_day+3 END
FROM qa3_reg r JOIN persons p ON p.id=r.attendee ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO event_participant_tickets (id,registration_id,position,code,checked_in_at)
SELECT reg||'-ticket-'||ticket.position,reg,ticket.position,upper(substr(md5(reg||':ticket:'||ticket.position),1,12)),
  CASE WHEN reg_status='CHECKED_IN' THEN starts END
FROM qa3_reg CROSS JOIN LATERAL generate_series(1,CASE WHEN family THEN 3 ELSE 1 END) ticket(position)
WHERE reg_status IN ('CONFIRMED','CHECKED_IN') AND guardian_state<>'PENDING' ON CONFLICT DO NOTHING;
-- step
INSERT INTO event_guardian_authorizations (id,organization_id,church_id,registration_id,guardian_display_name,status,
  acknowledgment_text,authorized_at,authorized_by_user_id,created_at,updated_at)
SELECT reg||'-guardian',org,church,reg,'TESTE 3M · Responsável fictício',guardian_state,
  'Autorização de exemplo, sem validade fora do DEV.',CASE WHEN guardian_state='AUTHORIZED' THEN start_day+3 END,
  CASE WHEN guardian_state='AUTHORIZED' THEN secretary END,start_day+1,start_day+3
FROM qa3_reg WHERE minor ON CONFLICT (registration_id) DO NOTHING;
-- step
INSERT INTO event_payment_intents (id,organization_id,church_id,event_id,registration_id,lot_id,amount_cents,status,
  provider_ref,receiving_account_id,ledger_entry_id,pix_txid,bank_credit_reference,confirmed_at,created_at,updated_at)
SELECT reg||'-payment',org,church,event,reg,event||'-lot',5900,payment_status,'rf1qa3-mock-'||m||'-'||j||'-'||n,
  'rf1qa3-receiving',CASE WHEN payment_status='CONFIRMED_PIX' THEN 'rf1qa3-entry-'||m||'-13' END,
  'QA3'||m||j||n||'TESTE',CASE WHEN payment_status='CONFIRMED_PIX' THEN 'TESTE-3M-CREDITO-'||m END,
  CASE WHEN payment_status IN ('CONFIRMED_PIX','CONFIRMED_MOCK') THEN start_day+3 END,start_day+1,start_day+3
FROM qa3_reg WHERE j IN (2,5) ON CONFLICT DO NOTHING;
-- step
CREATE TEMP TABLE qa3_rosters ON COMMIT DROP AS
SELECT s.*,q.*,g.name,g.label,g.n,'rf1qa3-roster-'||q.m||'-'||g.n AS roster,m.id AS ministry,
  q.start_day+(ARRAY[5,12,16,21,25,28])[g.n]+time '22:00' AS service,
  (CASE WHEN q.m<11 OR g.n<=3 THEN 'CLOSED' WHEN g.n=6 THEN 'DRAFT' ELSE 'PUBLISHED' END)::"RosterStatus" AS state
FROM qa3_scope s CROSS JOIN qa3_calendar q
JOIN ministries m ON m.slug='atmosfera' AND m.church_id=(SELECT church FROM qa3_scope)
CROSS JOIN (VALUES (1,'Recepção','Recepção do culto'),(2,'Conexão','Acolhimento'),
  (3,'Apoio Interno','Apoio de sala'),(4,'Recepção','Recepção do próximo culto'),
  (5,'Ofertas e Maquininhas','Equipe de ofertas'),(6,'Diáconos e Santa Ceia','Equipe de Ceia')) g(n,name,label);
-- step
INSERT INTO ministry_roster_modules (id,ministry_id,name,name_key,rules,created_at,updated_at)
SELECT DISTINCT 'rf1qa3-roster-module-'||md5(ministry||':'||name),ministry,name,
  translate(lower(name),'çãá','caa'),'{}'::jsonb,DATE '2026-09-01',DATE '2026-09-01'
FROM qa3_rosters ON CONFLICT (ministry_id,name_key) DO NOTHING;
-- step
INSERT INTO rosters (id,organization_id,church_id,ministry_id,module_id,title,service_at,status,created_at,updated_at)
SELECT r.roster,r.org,r.church,r.ministry,rm.id,'TESTE 3M · '||r.label,r.service,r.state,r.start_day,r.start_day
FROM qa3_rosters r JOIN ministry_roster_modules rm ON rm.ministry_id=r.ministry
  AND rm.name_key=translate(lower(r.name),'çãá','caa') ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO rosters (id,organization_id,church_id,ministry_id,portal_event_id,title,service_at,status,created_at,updated_at)
SELECT event||'-team',org,church,'rf1qa3-ministry-'||m,event,'TESTE 3M · Equipe do evento',starts,
  (CASE WHEN m<11 OR j=2 THEN 'CLOSED' ELSE 'PUBLISHED' END)::"RosterStatus",start_day,start_day
FROM qa3_events WHERE j IN (2,4,5) ON CONFLICT DO NOTHING;
-- step
CREATE TEMP TABLE qa3_slots ON COMMIT DROP AS
SELECT r.*,i,r.roster||'-slot-'||i AS slot,
  (ARRAY['Acolhimento','Coordenação','Apoio','Orientação'])[i] AS slot_label,
  CASE WHEN r.m=11 AND r.n=4 AND i=1 AND NOT EXISTS (
    SELECT 1 FROM roster_push_subscriptions WHERE church_id=r.church AND person_id=r.demo_member
  ) THEN r.demo_member ELSE 'rf1qa3-person-'||r.m||'-'||(i+2) END AS holder
FROM qa3_rosters r CROSS JOIN generate_series(1,4) i;
-- step
INSERT INTO roster_slots (id,roster_id,role_label,sort_order,sector,zone,side)
SELECT slot,roster,slot_label,i,'Salão','Entrada',CASE WHEN i%2=0 THEN 'Direita' ELSE 'Esquerda' END
FROM qa3_slots ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO roster_assignments (id,slot_id,person_id,status,confirmed_at,declined_at,created_at,updated_at)
SELECT slot||'-holder',slot,holder,
  (CASE WHEN state='DRAFT' THEN 'PENDING' WHEN i=1 AND state='PUBLISHED' THEN 'PENDING'
    WHEN i=3 AND state='PUBLISHED' THEN 'DECLINED' WHEN i=2 AND state='CLOSED' THEN 'SUBSTITUTED'
    ELSE 'CONFIRMED' END)::"RosterAssignmentStatus",
  CASE WHEN state='CLOSED' AND i<>2 OR state='PUBLISHED' AND i=2 THEN service-interval '2 days' END,
  CASE WHEN i=3 AND state='PUBLISHED' THEN service-interval '2 days' END,
  start_day,start_day
FROM qa3_slots WHERE state<>'DRAFT' OR i<3 ON CONFLICT DO NOTHING;
-- step
INSERT INTO roster_assignments (id,slot_id,person_id,status,substitute_for_id,confirmed_at,created_at,updated_at)
SELECT slot||'-replacement',slot,'rf1qa3-person-'||m||'-6','CONFIRMED',slot||'-holder',
  service-interval '1 day',start_day,start_day
FROM qa3_slots WHERE state='CLOSED' AND i=2 ON CONFLICT DO NOTHING;
-- step
INSERT INTO roster_slots (id,roster_id,role_label,sort_order)
SELECT e.event||'-team-slot-'||i,e.event||'-team',(ARRAY['Recepção','Credenciamento','Apoio'])[i],i
FROM qa3_events e CROSS JOIN generate_series(1,3) i WHERE e.j IN (2,4,5) ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO roster_assignments (id,slot_id,person_id,status,confirmed_at,created_at,updated_at)
SELECT e.event||'-team-slot-'||i||'-holder',e.event||'-team-slot-'||i,'rf1qa3-person-'||e.m||'-'||(i+2),
  (CASE WHEN e.m=11 AND e.j<>2 AND i=2 THEN 'PENDING' ELSE 'CONFIRMED' END)::"RosterAssignmentStatus",
  CASE WHEN e.m<11 OR e.j=2 OR i=1 THEN e.start_day+3 END,e.start_day,e.start_day
FROM qa3_events e CROSS JOIN generate_series(1,2) i WHERE e.j IN (2,4,5) ON CONFLICT DO NOTHING;
-- step
INSERT INTO roster_notices (id,church_id,person_id,kind,title,body,path,expires_at,sent_at,created_at)
SELECT 'rf1qa3-roster-notice-demo',church,demo_member,'published','TESTE 3M · Escala publicada',
  'Convite fictício para confirmar sua presença na escala de DEV.','/app/servir/meu-espaco/',
  DATE '2026-11-30',DATE '2026-11-18',DATE '2026-11-18' FROM qa3_scope ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO users (id,person_id,email,status,created_at,updated_at)
SELECT 'rf1qa3-invited-user-'||m||'-'||i,person,person||'@example.test','DISABLED',registered_on,registered_on
FROM qa3_people WHERE i BETWEEN 11 AND 13 ON CONFLICT DO NOTHING;
-- step
INSERT INTO grants (id,user_id,role_id,organization_id,church_id,created_at)
SELECT 'rf1qa3-invited-grant-'||m||'-'||i,'rf1qa3-invited-user-'||m||'-'||i,r.id,s.org,s.church,p.registered_on
FROM qa3_people p CROSS JOIN qa3_scope s JOIN roles r ON r.code='MEMBRO'
WHERE i BETWEEN 11 AND 13 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO access_invitations (id,user_id,token_hash,purpose,email,expires_at,sent_at,revoked_at,created_at)
SELECT 'rf1qa3-invite-'||m||'-'||i,'rf1qa3-invited-user-'||m||'-'||i,
  encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex'),'ACTIVATION',person||'@example.test',
  CASE WHEN m=11 AND i=11 THEN DATE '2026-11-30' ELSE registered_on+2 END,registered_on,
  CASE WHEN i=13 THEN registered_on+1 END,registered_on
FROM qa3_people WHERE i BETWEEN 11 AND 13 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO cms_contents (id,organization_id,church_id,kind,slug,title,summary,body,status,created_by_user_id,
  updated_by_user_id,published_at,created_at,updated_at)
SELECT 'rf1qa3-editorial-'||m||'-'||n,org,church,'NEWS','rf1qa3-editorial-'||m||'-'||n,
  'TESTE 3M · Aviso editorial '||m||'/'||n,'Conteúdo fictício para o DEV.',
  'Texto de treino para revisar, editar, publicar e arquivar no ambiente de desenvolvimento.',
  (ARRAY['RASCUNHO','REVISAO','APROVADO','PUBLICADO','ARQUIVADO'])[n]::"CmsWorkflowStatus",
  admin,admin,CASE WHEN n>=4 THEN start_day+2 END,start_day,start_day+3
FROM qa3_calendar CROSS JOIN qa3_scope CROSS JOIN generate_series(1,5) n ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO cms_content_revisions (id,content_id,from_status,to_status,actor_user_id,note,snapshot,created_at)
SELECT c.id||'-rev',c.id,'RASCUNHO',c.status,s.admin,'TESTE 3M · revisão editorial fictícia',
  jsonb_build_object('title',c.title,'summary',c.summary,'body',c.body,'status',c.status),c.updated_at
FROM cms_contents c CROSS JOIN qa3_scope s WHERE c.id LIKE 'rf1qa3-editorial-%' AND c.status<>'RASCUNHO'
ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO message_templates (id,organization_id,church_id,channel,code,name,subject,body,created_at,updated_at)
SELECT 'rf1qa3-template',org,church,'EMAIL','qa3-lembrete','TESTE 3M · Modelo de lembrete',
  'DEV · Lembrete fictício','Olá, {{nome}}. Esta é uma mensagem de teste.',
  DATE '2026-09-01',DATE '2026-09-01' FROM qa3_scope ON CONFLICT DO NOTHING;
-- step
INSERT INTO communication_consents (id,organization_id,church_id,person_id,whatsapp_opt_in,email_opt_in,push_opt_in,purposes,
  source,recorded_at,revoked_at,updated_at)
SELECT 'rf1qa3-consent-'||m||'-'||i,org,church,person,false,(i=1),false,'[]','qa3-ficticio',registered_on,
  CASE WHEN i=2 THEN registered_on+2 END,registered_on+2
FROM qa3_people CROSS JOIN qa3_scope WHERE i<=2 ON CONFLICT DO NOTHING;
-- step
INSERT INTO communication_outbox (id,organization_id,church_id,channel,status,person_id,to_address,template_id,template_code,
  subject,body_rendered,last_error,attempt_count,created_by_user_id,sent_at,delivered_at,created_at,updated_at)
SELECT 'rf1qa3-message-'||m||'-'||i,org,church,'EMAIL',(ARRAY['DELIVERED','DEAD','CANCELLED'])[i]::"OutboxStatus",
  person,person||'@example.test','rf1qa3-template','qa3-lembrete','TESTE 3M · Comunicação fictícia',
  'Registro sintético no histórico de comunicação.',CASE WHEN i=2 THEN 'Falha simulada sem envio.' END,
  CASE WHEN i=3 THEN 0 ELSE 1 END,admin,CASE WHEN i=1 THEN registered_on END,
  CASE WHEN i=1 THEN registered_on+1 END,registered_on,registered_on+1
FROM qa3_people CROSS JOIN qa3_scope WHERE i<=3 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO outbox_delivery_events (id,outbox_id,status,error_message,created_at)
SELECT id||'-history',id,status,last_error,updated_at FROM communication_outbox WHERE id LIKE 'rf1qa3-message-%'
ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO courses (id,organization_id,church_id,code,name,description,status,created_at,updated_at)
SELECT 'rf1qa3-course',org,church,'qa3-formacao','TESTE 3M · Formação de voluntários','Turmas e presença fictícias de DEV.',
  'ACTIVE',DATE '2026-09-01',DATE '2026-09-01' FROM qa3_scope ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO course_classes (id,course_id,organization_id,church_id,name,teacher_person_id,starts_at,ends_at,status,created_at,updated_at)
SELECT 'rf1qa3-class-'||m,'rf1qa3-course',org,church,'TESTE 3M · Turma '||m||'/2026',person,start_day+2,start_day+23,
  (CASE WHEN m=11 THEN 'OPEN' ELSE 'CLOSED' END)::"CourseClassStatus",start_day,start_day
FROM qa3_people CROSS JOIN qa3_scope WHERE i=1 ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO course_enrollments (id,class_id,person_id,status,enrolled_at,completed_at,certificate_approved_by_user_id,
  certificate_issued_at,created_at,updated_at)
SELECT 'rf1qa3-course-enrollment-'||m||'-'||i,'rf1qa3-class-'||m,person,
  (CASE WHEN m<11 AND i<5 THEN 'COMPLETED' WHEN i=6 THEN 'DROPPED' ELSE 'ENROLLED' END)::"CourseEnrollmentStatus",
  start_day+1,CASE WHEN m<11 AND i<5 THEN start_day+23 END,
  CASE WHEN m<11 AND i=2 THEN pastor END,CASE WHEN m<11 AND i=2 THEN start_day+24 END,
  start_day+1,CASE WHEN m<11 AND i<5 THEN start_day+24 ELSE start_day+1 END
FROM qa3_people CROSS JOIN qa3_scope WHERE i BETWEEN 2 AND 6 ON CONFLICT DO NOTHING;
-- step
INSERT INTO course_sessions (id,class_id,title,occurred_at,created_at,updated_at)
SELECT 'rf1qa3-class-session-'||m||'-'||n,'rf1qa3-class-'||m,'TESTE 3M · Aula '||n,start_day+2+n*5,start_day+2+n*5,start_day+2+n*5
FROM qa3_calendar CROSS JOIN generate_series(1,3) n ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO course_attendances (id,session_id,person_id,present,created_at,updated_at)
SELECT 'rf1qa3-class-attendance-'||m||'-'||i||'-'||n,'rf1qa3-class-session-'||m||'-'||n,person,i+n<>8,
  start_day+2+n*5,start_day+2+n*5
FROM qa3_people CROSS JOIN generate_series(1,3) n WHERE i BETWEEN 2 AND 6 ON CONFLICT DO NOTHING;
-- step
INSERT INTO church_assets (id,organization_id,church_id,code,name,description,location,responsible_person_id,status,acquired_at,created_at,updated_at)
SELECT 'rf1qa3-asset-'||m||'-'||i,org,church,'QA3-'||m||'-'||i,
  'TESTE 3M · '||(ARRAY['Projetor','Microfone','Mesa de som'])[i],'Equipamento fictício cadastrado para teste.',
  'Salão de exemplo',person,(ARRAY['ACTIVE','MAINTENANCE','DISPOSED'])[i]::"ChurchAssetStatus",
  start_day,start_day,start_day+2
FROM qa3_people CROSS JOIN qa3_scope WHERE i<=3 ON CONFLICT (id) DO NOTHING;

-- step
INSERT INTO church_asset_history (id,asset_id,kind,note,from_status,to_status,to_location,actor_user_id,recorded_at,created_at)
SELECT a.id||'-history',a.id,(CASE WHEN a.status='ACTIVE' THEN 'CREATED' ELSE 'STATUS_CHANGE' END)::"ChurchAssetHistoryKind",
  'TESTE 3M · movimentação de patrimônio fictícia',
  CASE WHEN a.status<>'ACTIVE' THEN 'ACTIVE'::"ChurchAssetStatus" END,a.status,a.location,s.admin,a.updated_at,a.updated_at
FROM church_assets a JOIN qa3_scope s ON s.church=a.church_id WHERE a.id LIKE 'rf1qa3-asset-%'
ON CONFLICT (id) DO NOTHING;
-- step
CREATE TEMP TABLE qa3_pdf ON COMMIT DROP AS
SELECT decode('JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOCAwIFIgL01lZGlhQm94IFsgMCAwIDU5NS4yNzU2IDg0MS44ODk4IF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNyAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMDAwMTAxMDAwMDAwKzAwJzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMDAwMTAxMDAwMDAwKzAwJzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKFRFU1RFIDNNIC0gQW5leG8gZmljdGljaW8gREVWKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0NvdW50IDEgL0tpZHMgWyA0IDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKOCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAyMjIKPj4Kc3RyZWFtCkdhcldxXyRcJTUkalBZJTpbb04sQT9LMnNuWWUtO0g8T1dfZWRhMXEsJz1oZ14wTT49Kz1TYzsrXllCIzphMSlNSjBTS0wmZUddKjVjQCklYzchQj1Fc1w3MFxYXU1VIXUqYj0uTC5zYldOPCRkRyQwQ2FUXzNMbFlaWU4uViJiSVYrcCpQRl1HUypDTlYwXDhpQ0BDI0RtYTAzOVInQF5OU0tQO1JXN25GQkJCcVUndHFhTE4tMztiUlUlJTwlcmxYbURtWzI1R2FLZmdjWFJ1VWJzPG87OlQkbS1+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDkKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDYxIDAwMDAwIG4gCjAwMDAwMDAxMDIgMDAwMDAgbiAKMDAwMDAwMDIwOSAwMDAwMCBuIAowMDAwMDAwMzIxIDAwMDAwIG4gCjAwMDAwMDA1MjQgMDAwMDAgbiAKMDAwMDAwMDU5MiAwMDAwMCBuIAowMDAwMDAwODc0IDAwMDAwIG4gCjAwMDAwMDA5MzMgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8NGE5NDI3ZDg3ZGI1MTdkMzJlNzNkYTA4OTcyODU3NTA+PDRhOTQyN2Q4N2RiNTE3ZDMyZTczZGEwODk3Mjg1NzUwPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA2IDAgUgovUm9vdCA1IDAgUgovU2l6ZSA5Cj4+CnN0YXJ0eHJlZgoxMjQ1CiUlRU9GCg==','base64') AS bytes;
-- step
CREATE TEMP TABLE qa3_files ON COMMIT DROP AS
SELECT q.*, s.*, 'rf1qa3-admission-'||q.m||'-13' AS admission,'rf1qa3-entry-'||q.m||'-15' AS entry,
  'admissions/'||s.org||'/'||s.church||'/rf1qa3-admission-'||q.m||'-13/anexo-ficticio' AS admission_key,
  'ledger/'||s.org||'/'||s.church||'/rf1qa3-entry-'||q.m||'-15/anexo-ficticio.pdf' AS entry_key
FROM qa3_calendar q CROSS JOIN qa3_scope s;
-- step
INSERT INTO private_files (key,bytes)
SELECT a.key,p.bytes FROM qa3_files f CROSS JOIN qa3_pdf p
CROSS JOIN LATERAL (VALUES (f.admission_key),(f.entry_key)) a(key) ON CONFLICT (key) DO NOTHING;
-- step
INSERT INTO admission_documents (id,admission_id,organization_id,church_id,uploaded_by_user_id,display_name,content_type,byte_size,storage_key,created_at)
SELECT 'rf1qa3-document-'||f.m,f.admission,f.org,f.church,f.secretary,'TESTE 3M - Documento fictício.pdf','application/pdf',
  octet_length(p.bytes),f.admission_key,f.start_day+6
FROM qa3_files f CROSS JOIN qa3_pdf p ON CONFLICT (id) DO NOTHING;
-- step
INSERT INTO ledger_entry_attachments (id,entry_id,organization_id,church_id,uploaded_by_user_id,display_name,content_type,byte_size,storage_key,created_at)
SELECT 'rf1qa3-attachment-'||f.m,f.entry,f.org,f.church,f.treasurer,'TESTE 3M - Comprovante fictício.pdf','application/pdf',
  octet_length(p.bytes),f.entry_key,f.start_day+17
FROM qa3_files f CROSS JOIN qa3_pdf p ON CONFLICT (id) DO NOTHING;
