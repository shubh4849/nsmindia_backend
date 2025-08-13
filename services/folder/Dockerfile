FROM node:20-alpine

WORKDIR /app

# Install deps first
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy app
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "start"]


