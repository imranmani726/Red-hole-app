FROM node:18-slim

RUN apt-get update && apt-get install -y ffmpeg && apt-get clean

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "server.js"]
