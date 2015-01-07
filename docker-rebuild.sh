docker stop `sudo docker ps -aq`
docker rm `sudo docker ps -aq`
docker rmi `sudo docker images | grep tv | awk '{print $3}'`
docker build -t tv .
docker run -it -v=`pwd`:/traceview tv
