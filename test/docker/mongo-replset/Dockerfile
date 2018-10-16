# DOCKER-VERSION 0.4.0

FROM ubuntu:14.04
RUN echo 'deb http://us.archive.ubuntu.com/ubuntu/ precise universe' >> /etc/apt/sources.list
RUN echo "deb http://repo.mongodb.org/apt/ubuntu trusty/mongodb-org/3.0 multiverse" >> /etc/apt/sources.list
RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 7F0CEB10
RUN apt-get -y update
RUN apt-get -y install mongodb-org=3.0.7 mongodb-org-server=3.0.7 mongodb-org-shell=3.0.7 mongodb-org-mongos=3.0.7 mongodb-org-tools=3.0.7 supervisor

# Add config
ADD ./supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD ./init-replicaset.conf /etc/supervisor/conf.d/init-replicaset.conf
ADD ./mongodb.conf /etc/mongodb.conf
ADD ./check_mongod.sh /tmp/check_mongod.sh
ADD ./start /src/start

# Mongo port - hardcoded for now.
EXPOSE 30001
EXPOSE 30002
EXPOSE 30003

CMD ["sh", "/src/start"]
