-- Zero legacy money rates on customer levels (levels remain for activity tiers only).
UPDATE customer_levels SET price_per_km = 0 WHERE 1 = 1;
