-- Dados fictícios para a filial isolada qa-massa-rf1-20261110.
-- Conferir o compute ep-misty-silence-b6n7k8ez antes da execução.
DO $$
BEGIN
  IF current_database() <> 'idriacho1_hml' OR NOT EXISTS (
    SELECT 1 FROM users WHERE id = 'qaPersonaUserRF1_tesouraria' AND email = 'qa.tesouraria.riacho1@example.test'
  ) THEN RAISE EXCEPTION 'Este acervo de testes exige o QA do ID Riacho 1'; END IF;
END $$;

INSERT INTO cost_centers (id, organization_id, church_id, code, name, active, created_at, updated_at)
SELECT 'qa_rf1_tesouraria_centro', p.organization_id, p.home_church_id, 'QA-TESOURARIA', 'Tesouraria · cenário de teste', true, now(), now()
FROM users u JOIN persons p ON p.id = u.person_id WHERE u.email = 'qa.tesouraria.riacho1@example.test'
ON CONFLICT DO NOTHING;

INSERT INTO ledger_accounts (id, organization_id, church_id, code, name, type, active, created_at, updated_at)
SELECT 'qa_rf1_tesouraria_' || a.slug, p.organization_id, p.home_church_id, a.code, a.name, a.type::"LedgerAccountType", true, now(), now()
FROM users u JOIN persons p ON p.id = u.person_id
CROSS JOIN (VALUES
  ('brb','1.1.10.01','BRB','ASSET'), ('bb','1.1.10.02','Banco do Brasil','ASSET'),
  ('sicoob','1.1.10.03','Sicoob','ASSET'), ('cora','1.1.10.04','Cora','ASSET'),
  ('cartao_receber','1.2.20.01','Cartões a liquidar','ASSET'), ('culto_depositar','1.2.20.02','Dinheiro de culto a depositar','ASSET'),
  ('contas_pagar','2.1.10.01','Contas a pagar','LIABILITY'), ('abertura','3.1.10.01','Saldo inicial','EQUITY'),
  ('pix','4.2.10.01','Ofertas por Pix','REVENUE'), ('cartao','4.2.10.02','Ofertas por cartão','REVENUE'),
  ('dinheiro','4.2.10.03','Ofertas em dinheiro','REVENUE'), ('operacional','5.1.10.01','Despesas da congregação','EXPENSE'),
  ('taxa','5.9.10.01','Taxas de cartão','EXPENSE')
) AS a(slug,code,name,type) WHERE u.email = 'qa.tesouraria.riacho1@example.test'
ON CONFLICT DO NOTHING;

INSERT INTO reconciliations (id, organization_id, church_id, title, period_start, period_end, status, notes, created_by_user_id, first_approved_by_user_id, first_approved_at, second_approved_by_user_id, second_approved_at, closed_at, created_at, updated_at)
SELECT 'qa_rf1_tesouraria_' || r.slug, p.organization_id, p.home_church_id, r.title, r.start_day::date, r.end_day::date,
  r.state::"ReconciliationStatus", 'Cenário fictício do QA', u.id,
  CASE WHEN r.state = 'CLOSED' THEN 'demoUserTesoura02' END, CASE WHEN r.state = 'CLOSED' THEN r.end_day::date + interval '18 hours' END,
  CASE WHEN r.state = 'CLOSED' THEN 'demoUserTesoura03' END, CASE WHEN r.state = 'CLOSED' THEN r.end_day::date + interval '19 hours' END,
  CASE WHEN r.state = 'CLOSED' THEN r.end_day::date + interval '19 hours' END, now(), now()
FROM users u JOIN persons p ON p.id = u.person_id
CROSS JOIN (VALUES
  ('conc_1','Conciliação bancária · 1 a 7 de novembro','2026-11-01','2026-11-07','CLOSED'),
  ('conc_2','Conciliação bancária · 8 a 14 de novembro','2026-11-08','2026-11-14','OPEN')
) AS r(slug,title,start_day,end_day,state)
WHERE u.email = 'qa.tesouraria.riacho1@example.test' ON CONFLICT DO NOTHING;

CREATE TEMP TABLE rf1_treasury_qa_seed (
  slug text, day date, title text, status text, debit text, credit text, cents integer, fee integer DEFAULT 0
) ON COMMIT DROP;

INSERT INTO rf1_treasury_qa_seed VALUES
  ('abertura_brb','2026-11-01','Saldo de abertura · BRB','APPROVED','brb','abertura',820000,0),
  ('abertura_bb','2026-11-01','Saldo de abertura · Banco do Brasil','APPROVED','bb','abertura',540000,0),
  ('abertura_sicoob','2026-11-01','Saldo de abertura · Sicoob','APPROVED','sicoob','abertura',1250000,0),
  ('abertura_cora','2026-11-01','Saldo de abertura · Cora','APPROVED','cora','abertura',680000,0),
  ('pix_brb','2026-11-01','Pix · Ofertas do culto da manhã','APPROVED','brb','pix',247000,0),
  ('pix_bb','2026-11-05','Pix · Quinta do Encontro','APPROVED','bb','pix',132500,0),
  ('pix_sicoob','2026-11-08','Pix · Santa Ceia da manhã','APPROVED','sicoob','pix',88000,0),
  ('pix_cora','2026-11-08','Pix · Santa Ceia da noite','APPROVED','cora','pix',76000,0),
  ('cartao_lote1','2026-11-01','Cartão · Lote do culto da noite','APPROVED','cartao_receber','cartao',315000,0),
  ('cartao_baixa1','2026-11-06','Liquidação de cartão · Cora','APPROVED','cora','cartao_receber',315000,9500),
  ('cartao_lote2','2026-11-08','Cartão · Lote da Santa Ceia','APPROVED','cartao_receber','cartao',228000,0),
  ('dinheiro_culto1','2026-11-01','Dinheiro contado · Culto de domingo','APPROVED','culto_depositar','dinheiro',185000,0),
  ('dinheiro_deposito1','2026-11-03','Depósito confirmado · BRB','APPROVED','brb','culto_depositar',185000,0),
  ('dinheiro_culto2','2026-11-08','Dinheiro contado · Santa Ceia','APPROVED','culto_depositar','dinheiro',97500,0),
  ('dinheiro_deposito2','2026-11-11','Confirmar depósito da Santa Ceia · Sicoob','DRAFT','sicoob','culto_depositar',97500,0),
  ('despesa_brb','2026-11-04','Pagamento · Manutenção do templo','APPROVED','operacional','brb',125000,0),
  ('despesa_bb','2026-11-05','Pagamento · Material para cultos','APPROVED','operacional','bb',46000,0),
  ('despesa_sicoob','2026-11-07','Pagamento · Infraestrutura','APPROVED','operacional','sicoob',260000,0),
  ('despesa_cora','2026-11-10','Pagamento · Apoio à programação','APPROVED','operacional','cora',60000,0),
  ('compromisso_1','2026-11-09','Conta a pagar · Fornecimento de energia','APPROVED','operacional','contas_pagar',132000,0),
  ('compromisso_2','2026-11-11','Conta a pagar · Serviço técnico','APPROVED','operacional','contas_pagar',84000,0);

WITH inserted AS (
  INSERT INTO ledger_entries (id, organization_id, church_id, entry_date, description, status, amount_cents,
    created_by_user_id, submitted_at, first_approved_by_user_id, first_approved_at, second_approved_by_user_id,
    second_approved_at, reconciliation_id, cost_center_id, competence_year, competence_month, created_at, updated_at)
  SELECT 'qa_rf1_tesouraria_' || s.slug, p.organization_id, p.home_church_id, s.day, s.title,
    s.status::"LedgerEntryStatus", s.cents, u.id,
    CASE WHEN s.status='APPROVED' THEN s.day + interval '12 hours' END,
    CASE WHEN s.status='APPROVED' THEN 'demoUserTesoura02' END, CASE WHEN s.status='APPROVED' THEN s.day + interval '13 hours' END,
    CASE WHEN s.status='APPROVED' THEN 'demoUserTesoura03' END, CASE WHEN s.status='APPROVED' THEN s.day + interval '14 hours' END,
    CASE WHEN s.status='APPROVED' AND s.day <= '2026-11-07' AND (s.debit IN ('brb','bb','sicoob','cora') OR s.credit IN ('brb','bb','sicoob','cora')) THEN 'qa_rf1_tesouraria_conc_1' END,
    'qa_rf1_tesouraria_centro', 2026, 11, now(), now()
  FROM rf1_treasury_qa_seed s CROSS JOIN users u JOIN persons p ON p.id=u.person_id
  WHERE u.email='qa.tesouraria.riacho1@example.test'
  ON CONFLICT (id) DO NOTHING RETURNING id
)
INSERT INTO ledger_entry_lines (id, entry_id, account_id, side, amount_cents, memo)
SELECT i.id || '_' || l.suffix, i.id, 'qa_rf1_tesouraria_' || l.account,
  l.side::"LedgerLineSide", l.cents, l.memo
FROM inserted i JOIN rf1_treasury_qa_seed s ON i.id='qa_rf1_tesouraria_' || s.slug
CROSS JOIN LATERAL (VALUES
  ('d',s.debit,'DEBIT',s.cents-s.fee,'QA · simulação'), ('c',s.credit,'CREDIT',s.cents,CASE WHEN s.credit IN ('cartao_receber','culto_depositar') THEN 'Tesouraria · baixa da pendência' ELSE 'QA · simulação' END),
  ('f','taxa','DEBIT',s.fee,'QA · taxa de cartão')
) l(suffix,account,side,cents,memo)
WHERE l.cents>0;
