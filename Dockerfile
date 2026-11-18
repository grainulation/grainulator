FROM node:24-slim AS package

WORKDIR /source

COPY . .
RUN node scripts/check-package.mjs \
    && npm pack --ignore-scripts --pack-destination /tmp \
    && mkdir /package \
    && tar -xzf /tmp/grainulation-grainulator-*.tgz --strip-components=1 -C /package \
    && node /package/bin/grainulator.js doctor --json

FROM node:24-slim
WORKDIR /app

# The portable package has no external runtime dependencies.
COPY --from=package /package/ ./

ENTRYPOINT ["node", "bin/grainulator.js"]
CMD ["mcp", "--dir", "/app"]
