FROM node:22-alpine

# ARG REVISIUM_VERSION

RUN apk add --no-cache bash ca-certificates curl tini \
  && update-ca-certificates

WORKDIR /app

RUN npm i -g revisium@0.7.0

ENV PATH="/usr/local/bin:${PATH}"
RUN mkdir -p /app/migrations /app/schemas /app/data \
  && chown -R node:node /app

ENTRYPOINT ["/sbin/tini","--"]
CMD ["revisium","--help"]

USER node
