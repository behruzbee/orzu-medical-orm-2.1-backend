# Используем легковесный образ Node.js 22 (как у вас в логах) на базе Debian (bookworm)
FROM node:22-bookworm-slim

# Устанавливаем Chromium и все необходимые системные библиотеки для Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Указываем Puppeteer, где лежит установленный браузер
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_BIN=/usr/bin/chromium

WORKDIR /app

# Копируем файлы пакетов и устанавливаем зависимости
COPY package*.json ./
RUN npm ci

# Копируем весь остальной код
COPY . .

# Собираем NestJS проект
RUN npm run build

EXPOSE 3000

# Запускаем собранное приложение
CMD ["npm", "run", "start:prod"]