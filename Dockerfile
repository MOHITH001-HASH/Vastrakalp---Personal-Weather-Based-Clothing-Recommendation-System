# Multi-stage production Dockerfile for Vastrakalp (React Frontend + Python FastAPI Backend)
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Python FastAPI Backend + Static Frontend Server
FROM python:3.10-slim AS runner
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python backend
COPY backend/ ./backend/

# Copy built React frontend from Stage 1 into /app/dist
COPY --from=frontend-builder /app/dist ./dist

ENV PORT=10000
EXPOSE 10000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "10000"]
