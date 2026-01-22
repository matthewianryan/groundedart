# Migrations

Use Alembic for schema changes.

Common commands (run from `apps/api`):

- Create a migration: `alembic revision -m "..." --autogenerate`
- Apply migrations: `alembic upgrade head`

