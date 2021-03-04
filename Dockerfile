### STAGE 1: Build ###
FROM node AS build
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npx tsc

### STAGE 2: Run ###
FROM node
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY --from=build /usr/src/app/dist ./
COPY --from=build /usr/src/app/public ./public

EXPOSE 3000
CMD [ "node", "./server.js" ]
