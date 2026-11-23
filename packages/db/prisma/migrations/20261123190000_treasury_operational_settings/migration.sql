-- Parâmetros operacionais com consumidor no backend. Não altera chaves bloqueadas nem dev_json já gravado.
INSERT INTO "system_setting_catalog" ("key", "title", "description", "value_type", "scope_kind", "default_json", "dev_json")
VALUES
  ('rosters.survey.open_day', 'Dia de abertura da pesquisa de escala', 'Dia do mês em que a pesquisa de disponibilidade abre. A janela segue por até quatro dias e termina no máximo no dia 28.', 'number', 'CHURCH', '25', '25'),
  ('events.agenda.keep_days_after_end', 'Dias do evento na agenda após o término', 'Quantos dias um evento publicado permanece na agenda pública depois de terminar. Zero oculta o evento assim que ele acaba.', 'number', 'CHURCH', '0', '0')
ON CONFLICT ("key") DO NOTHING;
