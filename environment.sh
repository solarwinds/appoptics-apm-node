# Update first
apt-get -y update

#
# supervisor
#
SUPERFILE=/etc/supervisor/conf.d/supervisord.conf
apt-get -y install supervisor
mkdir -p /var/log/supervisor
echo "[supervisord]
nodaemon=true" > $SUPERFILE

#
# redis
#
apt-get -y install redis-server
adduser --system --no-create-home redis
sed -i -e"s/^daemonize yes/daemonize no/" /etc/redis/redis.conf
echo "
[program:redis]
command=redis-server /etc/redis/redis.conf" | tee -a $SUPERFILE

#
# memcached
#
apt-get -y install memcached
adduser --system --no-create-home memcached
echo "
[program:memcached]
command=memcached -u memcached" | tee -a $SUPERFILE

#
# mongodb
#
apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 7F0CEB10
echo "deb http://downloads-distro.mongodb.org/repo/ubuntu-upstart dist 10gen" | tee -a /etc/apt/sources.list.d/mongodb.list
apt-get -y update
apt-get -y install mongodb-org
mkdir -p /data/db
echo "
[program:mongodb]
command=mongod" | tee -a $SUPERFILE

#
# mysql
#
apt-get -y install mysql-server mysql-client
mysql_install_db
mysqld_safe &
sleep 5
echo "GRANT ALL ON *.* TO admin@'%' IDENTIFIED BY 'mysql-server' WITH GRANT OPTION; FLUSH PRIVILEGES" | mysql
mysql -e 'CREATE DATABASE test; USE test; CREATE TABLE test (foo varchar(255));'
pkill mysqld_safe
echo "
[program:mysql]
command=mysqld_safe" | tee -a $SUPERFILE

#
# postgres
#
apt-get -y install postgresql-client postgresql-contrib postgresql libpq-dev
ln -s /etc/postgresql/9.3/main/postgresql.conf /var/lib/postgresql/9.3/main/postgresql.conf
sed -i -e 's/^\(host\s*all\s*all\s*127\.0\.0\.1\/32\s*\)md5/\1trust/gip' /etc/postgresql/9.3/main/pg_hba.conf
sudo -u postgres /usr/lib/postgresql/9.3/bin/postmaster -D "/var/lib/postgresql/9.3/main" &
sleep 5
sudo -u postgres psql -c 'create database test;' -U postgres
pkill postmaster
echo "
[program:postgresql]
user=postgres
command=/usr/lib/postgresql/9.3/bin/postmaster -D \"/var/lib/postgresql/9.3/main\"
process_name=%(program_name)s
stopsignal=INT
autostart=true
autorestart=true
redirect_stderr=true" | tee -a $SUPERFILE

#
# cassandra
#
apt-get -y install curl software-properties-common
add-apt-repository -y ppa:webupd8team/java
curl -L http://debian.datastax.com/debian/repo_key | sudo apt-key add -
echo "deb http://debian.datastax.com/community stable main" > /etc/apt/sources.list.d/datastax.list
/bin/echo debconf shared/accepted-oracle-license-v1-1 select true | /usr/bin/debconf-set-selections
apt-get -y update
apt-get -y install \
  oracle-java7-set-default \
  oracle-java7-installer \
  cassandra=2.0.11 \
  dsc20=2.0.11-1 \
  dnsmasq-base \
  iputils-ping \
  apt-utils
rm -f /etc/security/limits.d/cassandra.conf
cassandra -f &
sleep 5
echo "create keyspace test with replication = {'class':'SimpleStrategy','replication_factor':1};" | cqlsh --cqlversion=3.0.3
kill `ps auwx | grep cassandra | awk '{print $2}' | head -1`
echo "
[program:cassandra]
command=cassandra -f" | tee -a $SUPERFILE

#
# node/nvm
#
apt-get -y install software-properties-common python-software-properties build-essential curl
echo "" > $HOME/.bashrc
curl https://raw.githubusercontent.com/creationix/nvm/v0.20.0/install.sh | bash
. $HOME/.bashrc
nvm install 0.10
nvm alias default 0.10

#
# tracelyzer
# 
wget https://files.appneta.com/install_appneta.sh
sh ./install_appneta.sh f08da708-7f1c-4935-ae2e-122caf1ebe31
