#!/bin/bash

# script used to enable local mac dev.
# trigger via npm run.
# no other usage.
# always WIP.

cleanup() {
    docker-compose  -f ./dev/docker-compose.yml down -v --remove-orphans
    # remove artifacts left locally by previous npm install
    rm -rf node_modules 
}

set -e
trap cleanup EXIT

docker-compose  -f ./dev/docker-compose.yml run --service-ports --rm --name dev-agent dev-agent
