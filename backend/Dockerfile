FROM node:20-alpine
# pg_dump / psql for the backend's backup & restore module. The minor version
# needs to match the Postgres server in docker-compose.yml (currently PG 16).
RUN apk add --no-cache postgresql16-client
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
