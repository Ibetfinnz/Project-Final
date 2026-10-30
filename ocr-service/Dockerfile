FROM node:20-bookworm-slim

# poppler-utils ให้คำสั่ง pdftoppm สำหรับแปลง PDF เป็นรูปทีละหน้า
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY *.js ./

EXPOSE 3001

CMD ["node", "ocr-server.js"]
