INSERT INTO project_modules_catalog (id, name, description, icon, default_order, category)
VALUES ('punter', 'Punter', 'Apostas tradicionais baseadas em análise própria', 'Crosshair', 5, 'estrategia')
ON CONFLICT (id) DO NOTHING;