FROM node:20-bookworm-slim

# build-tools на случай, если prebuilt-бинарь better-sqlite3 не подойдёт
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install

COPY . .

# персистентная папка для БД
RUN mkdir -p /app/data
ENV DATA_DIR=/app/data
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]