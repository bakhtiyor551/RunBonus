-- Тариф кампании (обязателен при активации)

ALTER TABLE ad_campaigns
  ADD COLUMN tariff_id BIGINT NULL AFTER advertiser_id,
  ADD KEY idx_ad_campaigns_tariff (tariff_id),
  ADD CONSTRAINT fk_ad_campaigns_tariff FOREIGN KEY (tariff_id) REFERENCES ad_tariffs(id) ON DELETE SET NULL;
