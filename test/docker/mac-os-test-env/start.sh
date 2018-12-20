#!/usr/bin/env bash

cd /appoptics

. env.sh bash

echo "alias debug='mocha --inspect-brk=0.0.0.0:9229'" >> ~/.bash_aliases
echo
echo "*** Run 'debug' or 'debug <path-to-test-file>' to get into debug mode."
echo "*** In Chrome open chrome://inspect to access the debugging tools."
echo

/bin/bash