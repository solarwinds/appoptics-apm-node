FROM ubuntu:20.04
SHELL ["/bin/bash", "-c"]

# tools
RUN su - \
    && apt update \
    && apt-get install sudo -y \
    && apt -y install \
                curl \
                git \
                nano \
                g++ \
                python \
                make \
                postgresql-server-dev-12 \
                zip \
                unzip

# install docker (inception)
RUN curl -fsSL https://get.docker.com -o get-docker.sh && \
    sudo sh get-docker.sh

# install docker compose (inception++)
RUN curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose && \
    chmod +x /usr/local/bin/docker-compose

# install nvm
ENV NVM_DIR /root/.nvm

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash

# these are the stable versions as of July 2021
# cant use lts alias due to all sorts of Dockerfile limitations.
RUN source $NVM_DIR/nvm.sh \
    && nvm install v14.17.3 \
    && nvm install v12.22.3 \
    && nvm install v10.24.1 \
    && nvm install stable

# currently package-lock lockfileVersion is 1
# stay with 14.

# add node and npm to path so the commands are available
ENV NODE_PATH $NVM_DIR/v14.17.3/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v14.17.3/bin:$PATH

# Install tools needed for specific service tests (pg, oracle)
RUN apt -y install \
            libaio1 \
            postgresql-server-dev-12 \
            zip \
            unzip

# get and install oracle library
RUN curl -LO https://download.oracle.com/otn_software/linux/instantclient/195000/instantclient-basic-linux.x64-19.5.0.0.0dbru.zip
RUN mkdir /opt/oracle
RUN unzip instantclient-basic-linux.x64-19.5.0.0.0dbru.zip -d /opt/oracle/
RUN rm instantclient-basic-linux.x64-19.5.0.0.0dbru.zip
RUN echo 'export LD_LIBRARY_PATH=/opt/oracle/instantclient_19_5:$LD_LIBRARY_PATH' >> ~/.bashrc
RUN echo 'export LD_LIBRARY_PATH=/opt/oracle/instantclient_19_5:$LD_LIBRARY_PATH' >> ~/.profile
