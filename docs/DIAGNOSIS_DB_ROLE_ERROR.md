# Database Role Error Diagnosis

## Error
```
FATAL: role "groundedart" does not exist
```

## Root Cause
When running Alembic migrations locally, the connection is attempting to use the PostgreSQL role `groundedart`, but this role doesn't exist in the database instance you're connecting to.

**ACTUAL ISSUE DISCOVERED**: You have a **local PostgreSQL service running on port 5432** (via Homebrew: `postgresql@15`). When Alembic tries to connect to `localhost:5432`, it's connecting to your local PostgreSQL installation, NOT the Docker container. The local PostgreSQL doesn't have the `groundedart` role, which is why you're getting the error.

## Why This Happens
1. **Local PostgreSQL service is running**: A Homebrew PostgreSQL service (`postgresql@15`) is running on port 5432, intercepting connection attempts before they reach the Docker container.
2. **Port conflict**: Both your local PostgreSQL and the Docker container are trying to use port 5432. The local service binds to `localhost:5432` first, so connections go there instead of the container.
3. **Database volume was created with different configuration**: If the PostgreSQL container was previously started without the `POSTGRES_USER: groundedart` environment variable, the role won't exist (though this is less likely if you just recreated the container).

## Solutions

### Solution 1: Stop Local PostgreSQL Service (Recommended)
Stop your local PostgreSQL service so connections go to the Docker container:

```bash
# Stop the local PostgreSQL service
brew services stop postgresql@15

# Verify only Docker container is listening on port 5432
lsof -i :5432

# Wait for Docker container to be healthy, then run migrations
docker compose -f infra/docker-compose.yml ps db  # Should show "healthy"
cd apps/api
alembic -c alembic.ini upgrade head
```

**Note**: If you need your local PostgreSQL for other projects, use Solution 2 instead.

### Solution 2: Change Docker Container Port (Alternative)
If you need to keep your local PostgreSQL running, change the Docker container to use a different port:

1. Edit `infra/docker-compose.yml` and change the port mapping:
   ```yaml
   ports:
     - "5433:5432"  # Changed from "5432:5432"
   ```

2. Update your `.env` file (or `DATABASE_URL` environment variable):
   ```
   DATABASE_URL=postgresql+asyncpg://groundedart:groundedart@localhost:5433/groundedart
   ```

3. Restart the container:
   ```bash
   docker compose -f infra/docker-compose.yml down
   docker compose -f infra/docker-compose.yml up -d db
   ```

4. Run migrations:
   ```bash
   cd apps/api
   alembic -c alembic.ini upgrade head
   ```

### Solution 3: Recreate Database Container (If role still doesn't exist)
This will delete all existing data but ensure the role is created correctly:

```bash
# Stop and remove the database container and volume
docker compose -f infra/docker-compose.yml down -v

# Start fresh (this will create the role automatically)
docker compose -f infra/docker-compose.yml up -d db

# Wait for the database to be healthy, then run migrations
cd apps/api
alembic -c alembic.ini upgrade head
```

### Solution 4: Manually Create the Role (Keep Existing Data)
If you want to keep your existing database data, create the role manually:

```bash
# Connect to the database container as the postgres superuser
docker compose -f infra/docker-compose.yml exec db psql -U postgres

# In the PostgreSQL prompt, create the role and database:
CREATE ROLE groundedart WITH LOGIN PASSWORD 'groundedart';
CREATE DATABASE groundedart OWNER groundedart;
GRANT ALL PRIVILEGES ON DATABASE groundedart TO groundedart;
\q

# Now run migrations
cd apps/api
alembic -c alembic.ini upgrade head
```

### Solution 5: Verify Which Database You're Connecting To
Check if you're connecting to the correct instance:

```bash
# Check which containers are running
docker compose -f infra/docker-compose.yml ps

# Verify the database is accessible
docker compose -f infra/docker-compose.yml exec db psql -U groundedart -d groundedart -c "SELECT version();"
```

If this fails, the role doesn't exist and you need Solution 1 or 2.

## Prevention
Always ensure the database container is started with the correct environment variables from `infra/docker-compose.yml`:
- `POSTGRES_USER: groundedart`
- `POSTGRES_PASSWORD: groundedart`
- `POSTGRES_DB: groundedart`

These variables are only applied when the container is first created. If the volume already exists, they won't be applied unless you recreate the volume.
