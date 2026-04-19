-- Enforce that at most one user row can ever have role = 'admin'.
--
-- The partial unique index on the constant expression (1) is a standard
-- PostgreSQL pattern: all rows matching the WHERE clause share the same
-- index key, so the unique constraint rejects any attempt to insert a
-- second admin — whether through the application, a direct SQL statement,
-- or a future bug.  The index is a no-op for every non-admin role.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_admin ON users ((1)) WHERE role = 'admin';
