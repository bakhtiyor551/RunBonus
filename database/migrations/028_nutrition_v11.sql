-- RunBonus+ Nutrition v1.1: onboarding, target weight

ALTER TABLE user_nutrition_profile
  ADD COLUMN onboarding_completed TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE user_nutrition_profile
  ADD COLUMN target_weight_kg DECIMAL(5, 2) NULL;
