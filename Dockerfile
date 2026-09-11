FROM node:20-alpine

WORKDIR /app

# Install dependencies needed for native builds on Alpine Linux
RUN apk add --no-cache libc6-compat

# Copy dependency definitions first
COPY package.json package-lock.json* ./

# Clean install dependencies inside the Linux container
RUN npm install

# Copy source code
COPY . .

# Next.js development server port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run development server
CMD ["npm", "run", "dev"]