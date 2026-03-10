FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip build-essential && \
    pip3 install --no-cache-dir --break-system-packages pymupdf4llm && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
