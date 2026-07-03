-- RunBonus+ Nutrition: AI-диетолог — ежедневные отчёты

CREATE TABLE IF NOT EXISTS nutrition_coach_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  report_date DATE NOT NULL,
  score INT NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  recommendations_json JSON NOT NULL,
  tomorrow_tip TEXT NULL,
  context_json JSON NULL,
  source ENUM('rules', 'openai', 'hybrid') NOT NULL DEFAULT 'rules',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_coach_user_date (user_id, report_date),
  INDEX idx_coach_user_created (user_id, created_at),
  CONSTRAINT fk_coach_report_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
