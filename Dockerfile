# frontend + backend ใน container เดียว ส่วน PostgreSQL แยกอยู่อีก container (ดู docker-compose.yml)

# ขั้นที่ 1: build หน้าเว็บ React เป็นไฟล์ static
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# หน้าเว็บกับ API อยู่ origin เดียวกัน จึงใช้ path แบบ relative
ENV VITE_API_BASE_URL=/api/v1
RUN npx vite build

# ขั้นที่ 2: backend ที่เสิร์ฟทั้ง API และไฟล์หน้าเว็บจากขั้นที่ 1
FROM node:22-slim
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY --from=frontend /frontend/dist ./public
ENV NODE_ENV=production \
    PORT=5000 \
    FRONTEND_DIST=/app/public
EXPOSE 5000
CMD ["node", "src/server.js"]
