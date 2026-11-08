#!/usr/bin/env bash
# Build the images of the integration stack from the exact commits in tests/integration/stack.env. Nothing is pulled prebuilt and nothing is pushed:
# the images stay in the local Docker daemon, tagged sdk-it/<name>:<first 12 hex of the commit>. An image that already exists is not rebuilt.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)
src="$root/docker/build"
# shellcheck source=../stack.env
source "$root/stack.env"

# fetch REPO SHA DIR: the tree of exactly that commit, checked by hash
fetch() {
  rm -rf "$3"
  mkdir -p "$3"
  git -C "$3" init -q
  git -C "$3" remote add origin "$1"
  git -C "$3" fetch -q --depth 1 origin "$2"
  git -C "$3" checkout -q FETCH_HEAD
  [ "$(git -C "$3" rev-parse HEAD)" = "$2" ] || { echo "build-images: $1 did not give commit $2" >&2; exit 1; }
}

# pin_from FILE TAGGED DIGEST: replace the base image TAGGED in a FROM line of FILE by the same image at DIGEST; the line must be there exactly
pin_from() {
  local file=$1 tagged=$2 digest=$3 text
  text=$(cat "$file")
  [[ $text == *"FROM $tagged"* ]] || { echo "build-images: $file has no 'FROM $tagged' to pin" >&2; exit 1; }
  printf '%s\n' "${text//FROM $tagged/FROM $tagged@$digest}" >"$file"
}

build() { # NAME REPO SHA DOCKERFILE (relative to the checkout, or absolute)
  local name=$1 repo=$2 sha=$3 dockerfile=$4 tag="sdk-it/$1:${3:0:12}"
  if docker image inspect "$tag" >/dev/null 2>&1; then
    echo "build-images: $tag exists"
    return
  fi
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo "build-images: $name needs a 40-hex commit, got '$sha'" >&2; exit 1; }
  fetch "$repo" "$sha" "$src/$name"
  if [ "$name" = bft-core ]; then
    # the checkout is the pinned commit (checked above); only its base images are pinned further, by digest
    pin_from "$src/bft-core/scripts/Dockerfile" golang:1.24-bookworm sha256:1a6d4452c65dea36aac2e2d606b01b4a029ec90cc1ae53890540ce6173ea77ac
    pin_from "$src/bft-core/scripts/Dockerfile" gcr.io/distroless/base-debian12:debug-nonroot sha256:9162795c8ec16d4f83921e4c173d07ce366a5d6eef9c461e707dbef4f81146b9
  fi
  echo "build-images: building $tag"
  docker build --platform linux/amd64 -t "$tag" -f "$dockerfile" "$src/$name"
}

build bft-core "$BFT_CORE_REPO" "$BFT_CORE_SHA" "$src/bft-core/scripts/Dockerfile"
build aggregator "$AGGREGATOR_REPO" "$AGGREGATOR_SHA" "$root/docker/aggregator.Dockerfile"
