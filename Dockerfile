FROM node:18-alpine

WORKDIR /app

# Copy package files first (layer caching)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source code
COPY src ./src

# Expose API port
EXPOSE 3000

# Health check — must respond within 60s of start
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start server
CMD ["node", "src/server.js"]
