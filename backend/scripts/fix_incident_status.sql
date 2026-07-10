-- One-off fix: normalize uppercase status strings left by earlier ORM writes.
-- Run against incident_response DB before restarting the Celery worker.
--
-- If status is a VARCHAR column (Alembic native_enum=False):
UPDATE incidents SET status = 'open' WHERE status = 'OPEN';
UPDATE incidents SET status = 'auto_recovered' WHERE status = 'AUTO_RECOVERED';
UPDATE incidents SET status = 'resolved' WHERE status = 'RESOLVED';
--
-- Or run: alembic upgrade head  (migration 003_normalize_incident_status)
