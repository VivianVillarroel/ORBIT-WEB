FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node orbit-web ./orbit-web
COPY --chown=node:node deploy/node/preflight.mjs ./deploy/node/preflight.mjs
RUN mkdir -p /app/orbit-web/uploads/modelos /app/orbit-web/uploads/libros && chown -R node:node /app/orbit-web/uploads
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "--input-type=module", "-e", "const response = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/ready', {signal: AbortSignal.timeout(4000)}); process.exit(response.ok ? 0 : 1)"]
CMD ["node", "server/index.js"]
