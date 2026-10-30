FROM node:20-slim
# Chromium + ฟอนต์ไทย สำหรับสร้าง PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-thai-tlwg fonts-noto-cjk-extra ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 4000
CMD ["node", "src/index.js"]
