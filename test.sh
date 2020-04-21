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
# it's not possible to change oboe logging level on the fly so these
# have to be run one-at-a-time.
#
mocha test/solo/notifications.test.js
mocha test/solo/notifications-timeout.test.js

#
# verify that both types of tokens work
#
mocha test/swoken/*.test.js
mocha test/token/*.test.js

#
# this tests the http client through using the request package with promises. it's
# a step in the direction of end-to-end testing that should incorporate a server and
# verifying that the appoptics.com collector received the traces.
#
mocha test/composite/*.test.js

#
# run the probe tests
#
# they are last because at least one test doesn't close emitters or timers. that test causes
# node to hang.
#
mocha test/probes/*.test.js
