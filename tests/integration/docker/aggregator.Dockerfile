# The aggregator of the integration stack, from the source tree build-images.sh checked out at the pinned commit (no RocksDB: the stack uses the memory SMT).
# base images by digest (the index digest of the tag on 2026-11-05): the application code is pinned by commit, so the layers under it are pinned too
FROM golang:1.25-bookworm@sha256:3b4a11519ad929d1e1d261a12cff056f0c85b735253d7d861346b9c6f8b36437 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -trimpath -o /out/aggregator ./cmd/aggregator

FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/aggregator /app/aggregator
EXPOSE 3000
