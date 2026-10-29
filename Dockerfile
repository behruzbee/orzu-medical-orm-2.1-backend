FROM node:22-bookworm-slim

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
