FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    tigervnc-standalone-server \
    tigervnc-common \
    fluxbox \
    openbox \
    dbus-x11 \
    sudo \
    wget \
    novnc \
    websockify \
    gnome-keyring \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install
COPY admin/package.json ./admin/package.json
RUN npm --prefix admin install

COPY . .

RUN npm --prefix admin run build
RUN npx playwright install chromium --with-deps

RUN npm run build

ENV DISPLAY=:99

RUN mkdir -p ~/.vnc

EXPOSE 31338 5900 6080

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/bin/bash", "/docker-entrypoint.sh"]
