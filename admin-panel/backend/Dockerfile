# Stage 1: Build Frontend
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend
COPY admin-panel/frontend/package.json .
RUN npm install
COPY admin-panel/frontend .
# Set API URL to empty string for relative paths (same origin)
ENV VITE_API_URL=""
RUN npm run build

# Stage 2: Build Backend
FROM node:22-slim
RUN apt-get update && apt-get install -y \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Copy backend package.json from root context
COPY admin-panel/backend/package.json ./
RUN npm install

# Copy backend source code
COPY admin-panel/backend/ .
RUN npm run build
RUN mkdir -p uploads

# Copy built frontend assets to public directory
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 4000
CMD ["npm", "start"]
