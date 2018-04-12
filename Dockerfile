FROM node:4

ARG AO_TEST_PACKAGE
ARG AO_TEST_GITAUTH
ARG AO_TEST_COLLECTOR
ARG AO_TEST_COLLECTOR_CERT
# and the env vars to redirect liboboe's output
ARG AO_TEST_REPORTER
ARG AO_TEST_REPORTER_UDP

# add-apt-repository doesn't exist until
# these have been added
RUN apt-get update && apt-get -y install \
  software-properties-common \
  python-software-properties

#
# gcc 4.8.4 failed GLIBCXX_3.4.21 not found
#
#RUN add-apt-repository ppa:ubuntu-toolchain-r/test

# remove cache at end to reduce image size
RUN apt-get update && apt-get -y install gcc-4.9 g++-4.9 \
  software-properties-common \
  python-software-properties \
  build-essential \
  curl \
  git \
  wget \
  unzip \
  libpq-dev \
  libkrb5-dev \
  supervisor \
&& rm -rf /var/lib/apt/lists/*

#EXPOSE 7831

RUN echo "[supervisord]\nnodaemon=true\n[program:tracelyzer]\ncommand=/etc/init.d/tracelyzer start -DFOREGROUND\n" >> /etc/supervisord.conf

# hopefully fix errors
RUN sed -i "s/^exit 101$/exit 0/" /usr/sbin/policy-rc.d

# Now the docker-compose file is bind-mounting this directory as appoptics/
COPY ./install-appoptics-daemon.sh ao-tmp/
# COPY . appoptics/
RUN echo 'LISTEN_HOST=0.0.0.0' >> /etc/default/tracelyzer
RUN sh /ao-tmp/install-appoptics-daemon.sh f08da708-7f1c-4935-ae2e-122caf1ebe31

# the agent requires the service key now
ENV APPOPTICS_SERVICE_KEY f08da708-7f1c-4935-ae2e-122caf1ebe31

# these need to be right to work with private repos
ENV AO_TEST_PACKAGE $AO_TEST_PACKAGE
ENV AO_TEST_GITAUTH $AO_TEST_GITAUTH

# for testing connect to the local collector.
ENV APPOPTICS_COLLECTOR ${AO_TEST_COLLECTOR}
ENV APPOPTICS_TRUSTEDPATH /appoptics/${AO_TEST_COLLECTOR_CERT}

ENV APPOPTICS_REPORTER ${AO_TEST_REPORTER}
ENV APPOPTICS_REPORTER_UDP ${AO_TEST_REPORTER_UDP}

# need to set up for user other than root so npm won't depriv
#USER node

#CMD ["/bin/sh", "-c", "/usr/bin/tracelyzer", "-L 0.0.0.0", "-r"]
CMD ["/usr/bin/supervisord"]
