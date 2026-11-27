ALTER TABLE admins
  ADD COLUMN username VARCHAR(64) NULL AFTER id,
  ADD COLUMN full_name VARCHAR(160) NOT NULL DEFAULT '' AFTER email,
  ADD COLUMN ministry_id INT NULL AFTER full_name;

UPDATE admins
SET username = CASE
  WHEN CHAR_LENGTH(LOWER(SUBSTRING_INDEX(email, '@', 1))) < 3
    THEN CONCAT('admin_', SUBSTRING(REPLACE(id, '-', ''), 1, 8))
  ELSE LEFT(LOWER(SUBSTRING_INDEX(email, '@', 1)), 32)
END;

ALTER TABLE admins
  MODIFY COLUMN username VARCHAR(64) NOT NULL,
  MODIFY COLUMN email VARCHAR(254) NULL,
  ADD UNIQUE KEY admins_username_unique (username);
