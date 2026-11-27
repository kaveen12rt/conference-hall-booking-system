CREATE TABLE hall_maintenance_windows (
  id CHAR(36) PRIMARY KEY,
  hall_id CHAR(36) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CHECK (ends_at > starts_at),
  KEY hall_maintenance_windows_hall_time_idx (hall_id, starts_at, ends_at),
  CONSTRAINT hmw_hall_fk FOREIGN KEY (hall_id) REFERENCES conference_halls(id) ON DELETE CASCADE,
  CONSTRAINT hmw_admin_fk FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
