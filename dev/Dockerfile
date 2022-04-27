FROM ubuntu:20.04
SHELL ["/bin/bash", "-c"]

# general tools
RUN apt update \
    && apt -y install \
                curl \
                git \
                nano \
                g++ \
                python \
                make

# set time zone (for github cli)
ENV TZ=America/Los_Angeles
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# for github cli
RUN apt -y install \
            gnupg \
            software-properties-common \
            tzdata

# get and install github cli
# see: https://github.com/cli/cli/issues/1797#issuecomment-696469523
RUN apt-key adv --keyserver keyserver.ubuntu.com --recv-key C99B11DEB97541F0 \
    && apt-add-repository https://cli.github.com/packages \
    && apt -y install gh

# install nvm
ENV NVM_DIR /root/.nvm

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash

# these are the stable versions as of April 2022
# can't use lts alias due to all sorts of Dockerfile limitations.
RUN source $NVM_DIR/nvm.sh \
    && nvm install v18.0.0 \
    && nvm install v16.14.2 \
    && nvm install v14.19.1 \
    && nvm install v12.22.12 \
    && nvm install v10.24.1 \
    && nvm install stable

# add node and npm to path so the commands are available
ENV NODE_PATH $NVM_DIR/v16.14.2/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v16.14.2/bin:$PATH

# Install tools needed for specific service tests (pg, oracle)
RUN apt -y install \
            libaio1 \
            postgresql-server-dev-12 \
            zip \
            unzip

# get and install oracle library
RUN curl -LO https://download.oracle.com/otn_software/linux/instantclient/195000/instantclient-basic-linux.x64-19.5.0.0.0dbru.zip \
    && mkdir /opt/oracle \
    && unzip instantclient-basic-linux.x64-19.5.0.0.0dbru.zip -d /opt/oracle/ \
    && rm instantclient-basic-linux.x64-19.5.0.0.0dbru.zip

# set for usage
ENV LD_LIBRARY_PATH /opt/oracle/instantclient_19_5:$LD_LIBRARY_PATH
