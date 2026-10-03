ALTER TABLE reports ADD COLUMN assessment TEXT;
ALTER TABLE reports ADD COLUMN ai_state TEXT NOT NULL DEFAULT 'pending' CHECK (ai_state IN ('pending','processing','evaluated','failed'));
ALTER TABLE reports ADD COLUMN ai_error TEXT;
ALTER TABLE reports ADD COLUMN assessment_model TEXT;
ALTER TABLE reports ADD COLUMN assessed_at TEXT;
ALTER TABLE reports ADD COLUMN priority_override INTEGER CHECK (priority_override BETWEEN 1 AND 5);
ALTER TABLE reports ADD COLUMN department_override TEXT CHECK (department_override IN ('comune_di_milano','atm','trenord_rfi','green_space_operator','local_police','unknown'));
ALTER TABLE reports ADD COLUMN operations_updated_at TEXT;
CREATE INDEX reports_ai_state_idx ON reports(ai_state,created_at);
