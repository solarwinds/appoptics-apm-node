FROM ubuntu:14.04

ADD ./environment.sh /tmp/environment.sh
RUN /bin/sh /tmp/environment.sh

CMD ["/bin/bash"]
