FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json turbo.json tsconfig.base.json ./
COPY shared/types ./shared/types
COPY packages/ocpp-gateway ./packages/ocpp-gateway
RUN npm install --workspace=@ocpp-platform/types --workspace=@ocpp-platform/ocpp-gateway
RUN npm run build --workspace=@ocpp-platform/types
RUN npm run build --workspace=@ocpp-platform/ocpp-gateway

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/ocpp-gateway/dist ./dist
COPY --from=builder /app/packages/ocpp-gateway/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 9000 9001
CMD ["node", "dist/index.js"]
