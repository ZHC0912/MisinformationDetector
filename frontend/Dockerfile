# ── Frontend: build React, serve static with nginx ───────────
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
# npm install (not `npm ci`) — the committed package-lock.json is out of sync with
# package.json, and install is lenient (matches the local dev workflow). Switch
# back to `npm ci` after regenerating the lock with a local `npm install`.
RUN npm install --no-audit --no-fund

COPY . .
# Baked into the build — the browser runs on the host, so it must reach the
# backend at the host-mapped port, not the internal docker service name.
ARG REACT_APP_API_URL=http://localhost:8000
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build

# ── Serve ──────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
