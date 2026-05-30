FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY TEST_70_QUESTIONS.md ./

ENV NODE_ENV=production

CMD ["node", "src/bot.js"]
