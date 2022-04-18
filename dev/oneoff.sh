#!/bin/bash

# script used to allow testing on a "one off" container.
# trigger via npm run.
# no other usage.
# always WIP.
#
# Can use specific tags:
#
# Official:
#   node:latest
#   node:14.16.1-stretch
#
# Or own:
# ghcr.io/solarwindscloud/solarwinds-bindings-node/node:16-centos7-build
# ghcr.io/solarwindscloud/solarwinds-bindings-node/node:14-alpine3.9
# 
# more official images at: https://hub.docker.com/_/node?tab=tags
# more own images at: https://github.com/solarwindscloud/solarwinds-bindings-node/pkgs/container/solarwinds-bindings-node%2Fnode/versions

os_node=${1:-'node:14-buster'} # stick to 14 for lockfileVersion stability

set -e

# pull a standard image
docker pull "$os_node"

# open a shell in detached mode
container_id=$(docker run -itd \
    --hostname "${os_node}" \
    --privileged \
    --workdir /usr/src/work \
    -v ~/.gitconfig:/root/.gitconfig \
    -v ~/.ssh:/root/.ssh \
    --env-file .env \
    "$os_node" sh)

docker cp ./. "$container_id":/usr/src/work/

docker exec "$container_id" npm install --unsafe-perm

echo "Show system info"
echo "Container Id is ""$container_id"""
echo '****************'

docker exec "$container_id" printenv
docker exec "$container_id" node --version
docker exec "$container_id" npm --version
docker exec "$container_id" cat /etc/os-release
docker exec "$container_id" pwd

# ready for work
docker attach "$container_id"
