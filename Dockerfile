FROM node:22-alpine

RUN apk add --no-cache bash ca-certificates curl tini \
  && update-ca-certificates

RUN npm i -g revisium \
 && revisium --version \
 && echo "✅ Installed revisium successfully"

WORKDIR /app
RUN mkdir -p /app/data \
 && chown -R node:node /app

COPY --chown=node:node revisium-entrypoint.sh /usr/local/bin/revisium-entrypoint.sh
RUN chmod +x /usr/local/bin/revisium-entrypoint.sh

ENTRYPOINT ["/sbin/tini","--","/usr/local/bin/revisium-entrypoint.sh"]

USER node