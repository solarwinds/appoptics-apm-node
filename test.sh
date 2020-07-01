#!/bin/bash
#
# script to run tests
#

# various tests are separated because mocha consolidates all tests in each command as one
# so they are not truly independent. e.g., every require across all tests is required at
# the start of tests. that makes it impossible to run tests without the addon loaded when
# some tests do load the addon.
#

ERRORS=( )
PASSED=0

#
# run unit tests with the addon enabled
#
NEW_ERRORS=""
FS=$(ls test/*.test.js)
for F in $FS
do
    mocha $F
    if [ $? -ne 0 ]
    then
        NEW_ERRORS="$NEW_ERRORS $F"
    else
        PASSED=`expr $PASSED + 1`
    fi
done
if [ ! -z "$NEW_ERRORS" ]; then
    ERRORS+=( "CORE_ERRORS:$NEW_ERRORS" )
fi

#
# run unit tests without the addon enabled
#
NEW_ERRORS=""
FS=$(ls test/no-addon/*.test.js)
for F in $FS
do
    mocha $F
    if [ $? -ne 0 ]
    then
        NEW_ERRORS="$NEW_ERRORS $F"
    else
        PASSED=`expr $PASSED + 1`
    fi
done
if [ ! -z "$NEW_ERRORS" ]; then
    ERRORS+=( "NO_ADDON_ERRORS:$NEW_ERRORS" )
fi
#mocha test/*.test.js
#mocha test/no-addon/*.test.js

#
# it's not possible to change oboe logging level on the fly so these
# have to be run one-at-a-time.
#
NEW_ERRORS=""
FS=$(ls test/solo/*.test.js)
for F in $FS
do
    mocha $F
    if [ $? -ne 0 ]
    then
        NEW_ERRORS="$NEW_ERRORS $F"
    else
        PASSED=`expr $PASSED + 1`
    fi
done
if [ ! -z "$NEW_ERRORS" ]; then
    ERRORS+=( "SOLO_ERRORS:$NEW_ERRORS" )
fi
#mocha test/solo/notifications.test.js
#mocha test/solo/notifications-timeout.test.js

#
# it's not possible to change oboe logging level on the fly so these
# have to be run one-at-a-time.
#
mocha test/solo/notifications.test.js
mocha test/solo/notifications-timeout.test.js

#
# verify that both types of tokens work
#
NEW_ERRORS=""
FS=$(ls test/swoken/*.test.js)
for F in $FS
do
    mocha $F
    if [ $? -ne 0 ]
    then
        NEW_ERRORS="$NEW_ERRORS $F"
    else
        PASSED=`expr $PASSED + 1`
    fi
done
if [ ! -z "$NEW_ERRORS" ]; then
    ERRORS+=( "SWOKEN_ERRORS:$NEW_ERRORS" )
fi

NEW_ERRORS=""
FS=$(ls test/token/*.test.js)
for F in $FS
do
    mocha $F
    if [ $? -ne 0 ]
    then
        NEW_ERRORS="$NEW_ERRORS $F"
    else
        PASSED=`expr $PASSED + 1`
    fi
done
if [ ! -z "$NEW_ERRORS" ]; then
    ERRORS+=( "TOKEN_ERRORS:$NEW_ERRORS" )
fi
#mocha test/swoken/*.test.js
#mocha test/token/*.test.js

#
# this tests the http client through using the request package with promises. it's
# a step in the direction of end-to-end testing that should incorporate a server and
# verifying that the appoptics.com collector received the traces.
#
NEW_ERRORS=""
FS=$(ls test/composite/*.test.js)
for F in $FS
do
    mocha $F
    if [ $? -ne 0 ]
    then
        NEW_ERRORS="$NEW_ERRORS $F"
    else
        PASSED=`expr $PASSED + 1`
    fi
done
if [ ! -z "$NEW_ERRORS" ]; then
    ERRORS+=( "COMPOSITE_ERRORS:$NEW_ERRORS" )
fi
#mocha test/composite/*.test.js

#
# run the probe tests
#
# they are last because at least one test might not close emitters or timers. that test causes
# node to hang.
#
NEW_ERRORS=""
FS=$(ls test/probes/*.test.js)
for F in $FS
do
    mocha $F
    if [ $? -ne 0 ]
    then
        NEW_ERRORS="$NEW_ERRORS $F"
    else
        PASSED=`expr $PASSED + 1`
    fi
done
if [ ! -z "$NEW_ERRORS" ]; then
    ERRORS+=( "COMPOSITE_ERRORS:$NEW_ERRORS" )
fi


# provide a summary of the test results.
if [ ${#ERRORS[*]} -ne 0 ]; then
    echo "$PASSED test suites passed"
    echo "${#ERRORS[*]} test suites failed"
    for ix in ${!ERRORS[@]}
    do
        echo ${ERRORS[$ix]}
    done

    exit 1
else
    echo "No errors - $PASSED test suites passed"
fi
