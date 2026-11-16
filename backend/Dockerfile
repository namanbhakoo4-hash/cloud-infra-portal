
FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip -o /tmp/terraform.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin \
    && rm /tmp/terraform.zip \
    && terraform version

COPY backend/package*.json ./backend/

WORKDIR /app/backend

RUN npm ci --omit=dev

WORKDIR /app

COPY backend ./backend

COPY terraform/modules ./terraform/modules

RUN mkdir -p /app/terraform/generated \
    /root/.terraform/terraform/plugin-cache

WORKDIR /app/backend

EXPOSE 5000

CMD ["npm", "start"]
