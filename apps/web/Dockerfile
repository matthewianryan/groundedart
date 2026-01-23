FROM node:20-alpine

WORKDIR /app/apps/web

COPY apps/web/package.json apps/web/package-lock.json /app/apps/web/
RUN npm ci

COPY apps/web /app/apps/web

COPY apps/web/docker-entrypoint.sh /usr/local/bin/ga-web-entrypoint.sh

EXPOSE 5173

ENTRYPOINT ["sh", "/usr/local/bin/ga-web-entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
