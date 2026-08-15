# ── Frontend: build with Vite, serve static with nginx ────────
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
# npm install (not `npm ci`) — the lock is regenerated locally; install is
# lenient and matches the dev workflow. Switch to `npm ci` once package-lock.json
# is committed and in sync.
RUN npm install --no-audit --no-fund

COPY . .
# Baked into the build — the browser runs on the host, so it must reach the
# backend at the host-mapped port, not the internal docker service name.
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Serve ──────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
