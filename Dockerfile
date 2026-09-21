# ==========================================
# 1. Multi-Stage Build: Builder Phase
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .

# Build Vite frontend and bundled Node backend
RUN npm run build

# ==========================================
# 2. Multi-Stage Build: Production Runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled frontend and bundled backend from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# Cloud Run dynamic port exposure
EXPOSE 3000

# Start compiled server
CMD ["node", "dist/server.js"]
