#
# script to run tests
#

# various tests are separated because mocha consolidates all tests in each command as one
# so they are not truly independent. e.g., every require across all tests is required at
# the start of tests. that makes it impossible to run tests without the addon loaded when
# some tests do load the addon.
#

#
# run unit tests with and without the addon enabled
#
mocha test/*.test.js
mocha test/no-addon/*.test.js

#
# this tests the http client through using the request package with promises. it's
# a step in the direction of end-to-end testing that should incorporate a server and
# verifying that the appoptics.com collector received the traces.
# TODO BAM
#
mocha test/composite/*.test.js

#
# run the probe tests
#
# this is last because the oracle fails and causes node to hang when run locally.
# TODO BAM fix local oracle setup.
#
mocha test/probes/*.test.js
