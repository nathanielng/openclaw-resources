FROM node:22-alpine

# docker CLI + compose plugin needed to exec compose commands
RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev

COPY server.js .
COPY public/ public/

EXPOSE 4000
CMD ["node", "server.js"]
