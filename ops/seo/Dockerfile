FROM node:22-bookworm-slim
ENV CHROME_PATH=/usr/bin/chromium
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY audit-site.mjs ./
ENTRYPOINT ["node", "audit-site.mjs"]
