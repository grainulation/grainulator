FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts || npm install

COPY . .

ENTRYPOINT ["node", "bin/grainulator.js", "mcp", "--dir", "/app"]
