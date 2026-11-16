
FROM node:24-bookworm-slim AS builder

WORKDIR /app

COPY frontend/package*.json ./

RUN npm ci

COPY frontend/ ./

RUN npm run build

FROM nginx:1.28-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY deployment/nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
