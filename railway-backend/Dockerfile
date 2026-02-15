FROM node:20-alpine

WORKDIR /app

COPY railway-backend/package.json railway-backend/package-lock.json* ./
RUN npm ci --production

COPY railway-backend/src ./src

EXPOSE 3000

CMD ["node", "src/index.js"]
