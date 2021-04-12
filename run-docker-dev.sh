#!/bin/bash
#
# to run the image:
# ./run_docker_dev [node version, defaults to 14]

ver=${1:-14}

# create minimal dev image if needed
if [ -z "$(docker images -q nodedev:${ver})" ]; then
    echo "
FROM node:${ver}
RUN npm install -g eslint mocha
    " | docker build -t "nodedev:${ver}" -
fi

docker run -it \
    --hostname "node-${ver}" \
    --privileged \
    --workdir /code/appoptics-apm-node \
    -v `pwd`:/code/appoptics-apm-node \
    -v "$(dirname $PWD)/appoptics-bindings-node":/code/appoptics-bindings-node \
    nodedev:$ver bash
