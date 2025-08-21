FROM node:22-alpine

RUN apk add --no-cache bash ca-certificates curl tini \
  && update-ca-certificates

WORKDIR /app

ARG REVISIUM_VERSION
RUN if [ -n "$REVISIUM_VERSION" ]; then \
      npm i -g "revisium@${REVISIUM_VERSION}"; \
    else \
      npm i -g revisium; \
    fi

RUN mkdir -p /app/migrations /app/schemas /app/data

COPY --chown=node:node revisium-entrypoint.sh /usr/local/bin/revisium-entrypoint.sh
RUN chmod +x /usr/local/bin/revisium-entrypoint.sh

ENTRYPOINT ["/sbin/tini","--","/usr/local/bin/revisium-entrypoint.sh"]

USER node