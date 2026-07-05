FROM nginx:1.27-alpine

# Cloud Run передаёт порт через $PORT (по умолчанию 8080).
# Официальный образ nginx подставляет переменные окружения
# в шаблоны из /etc/nginx/templates при старте.
ENV PORT=8080

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY site/ /usr/share/nginx/html/

EXPOSE 8080
