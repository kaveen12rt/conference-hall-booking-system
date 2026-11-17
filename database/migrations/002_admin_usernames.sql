ALTER TABLE admins
  ADD COLUMN username TEXT;

WITH normalized_admins AS (
  SELECT id,
         CASE
           WHEN LENGTH(clean_name) < 3
             THEN 'admin_' || SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8)
           ELSE LEFT(clean_name, 32)
         END AS base_username
  FROM (
    SELECT id,
           REGEXP_REPLACE(
             REGEXP_REPLACE(LOWER(SPLIT_PART(email, '@', 1)), '[^a-z0-9._-]', '', 'g'),
             '^[^a-z0-9]+',
             ''
           ) AS clean_name
    FROM admins
  ) names
),
ranked_admins AS (
  SELECT id,
         base_username,
         ROW_NUMBER() OVER (PARTITION BY base_username ORDER BY id) AS duplicate_number
  FROM normalized_admins
)
UPDATE admins AS admin
SET username = CASE
  WHEN ranked.duplicate_number = 1 THEN ranked.base_username
  ELSE LEFT(ranked.base_username, 15) || '_' ||
       SUBSTRING(REPLACE(admin.id::text, '-', '') FROM 1 FOR 16)
END
FROM ranked_admins AS ranked
WHERE admin.id = ranked.id;

ALTER TABLE admins
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX admins_username_lower_unique ON admins (LOWER(username));
