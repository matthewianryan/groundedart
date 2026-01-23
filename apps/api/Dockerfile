FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/apps/api

COPY apps/api/pyproject.toml apps/api/README.md /app/apps/api/
COPY apps/api/src /app/apps/api/src
COPY apps/api/alembic.ini /app/apps/api/alembic.ini
COPY apps/api/scripts /app/apps/api/scripts

RUN python -m pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -e .
