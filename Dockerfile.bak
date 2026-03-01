FROM node:20-alpine
WORKDIR /app
COPY . .
RUN cd apps/launchpad && npm install --legacy-peer-deps && NODE_OPTIONS="--max-old-space-size=4096" npm run build
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["sh", "-c", "cd apps/launchpad && npm start"]
