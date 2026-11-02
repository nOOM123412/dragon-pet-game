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
# Приложение слушает НЕ internal_port (его занимает супервизор Bothost), а отдельный порт,
# на который супервизор проксирует запросы для домена.
ENV PORT=8081

EXPOSE 3000 8081

CMD ["node", "server.js"]