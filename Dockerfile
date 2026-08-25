FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

ENV DATA_DIR=/app/data
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]
