#!/bin/bash
#
# script to run tests
#

#
# various tests are separated because mocha consolidates all tests in each command as one
# so they are not truly independent. e.g., every require across all tests is required at
# the start of tests. that makes it impossible to run tests without the addon loaded when
# some tests do load the addon.
#

ERRORS=( )          # list of "GROUP test test test GROUP ..." which failed
SKIPPED=( )         # as above for tests that were skipped

GROUPS_PASSED=0
GROUPS_FAILED=0

SUITES_PASSED=0
SUITES_FAILED=0
SUITES_SKIPPED=0

# if one of the strings in SKIP is found in a test file that file will be skipped.
SKIP=${SKIP:-"test/solo/notifications"}

function skipThis() {
    for s in $SKIP
    do
        if [[ "$1" == *"$s"* ]]; then
            return 1
        fi
    done
    return 0
}

# executeTests name pattern
function executeTestGroup() {
    local group_name=$1
    local test_pattern=$2

    local new_errors=""
    local new_skipped=""

    local FS=$(ls $test_pattern)
    for F in $FS
    do
        skipThis $F
        if [ $? -eq 1 ]; then
            new_skipped="$new_skipped $F"
            SUITES_SKIPPED=`expr $SUITES_SKIPPED + 1`
        else
            mocha $F
            if [ $? -ne 0 ]; then
                new_errors="$new_errors $F"
                SUITES_FAILED=`expr $SUITES_FAILED + 1`
            else
                SUITES_PASSED=`expr $SUITES_PASSED + 1`
            fi
        fi
    done
    if [ -z "$new_errors" ]; then
        GROUPS_PASSED=`expr $GROUPS_PASSED + 1`
    else
        GROUPS_FAILED=`expr $GROUPS_FAILED + 1`
        ERRORS+=( "$group_name:$new_errors" )
    fi
    if [ -n "$new_skipped" ]; then
        SKIPPED+=( "$group_name:$new_skipped" )
    fi
}


#
# run unit tests with the addon enabled
#
executeTestGroup "CORE" "test/*.test.js"

#
# run unit tests without the addon disabled
#
executeTestGroup "NO-ADDON" "test/no-addon/*.test.js"

#
# originally these tests were the only ones to run one-at-a-time
# because it's not possible to change the oboe logging level after
# initialization time. now they don't really need to be separate.
#
executeTestGroup "SOLO" "test/solo/*.test.js"


#
# verify that both types of tokens work
#
executeTestGroup "SWOKEN" "test/swoken/*.test.js"
executeTestGroup "TOKEN" "test/token/*.test.js"

#
# this tests the http client through using the request package with promises. it's
# a step in the direction of end-to-end testing that should incorporate a server and
# verifying that the appoptics.com collector received the traces.
#
executeTestGroup "COMPOSITE" "test/composite/*.test.js"

#
# run the probe tests
#
# they are last because at least one test might not close emitters or timers. that test causes
# node to hang.
#
executeTestGroup "PROBES" "test/probes/*.test.js"


#=======================================
# provide a summary of the test results.
#=======================================
if [ ${#ERRORS[*]} -ne 0 ]; then
    echo "$SUITES_PASSED suites in $GROUPS_PASSED groups passed"
    echo "$SUITES_FAILED suites in ${#ERRORS[*]} groups failed"
    for ix in ${!ERRORS[@]}
    do
        echo "    ${ERRORS[$ix]}"
    done
    if [ $SUITES_SKIPPED -ne 0 ]; then
        echo "$SUITES_SKIPPED suites in ${#SKIPPED[*]} groups skipped"
        for ix in ${!SKIPPED[@]}
        do
            echo "    ${SKIPPED[$ix]}"
        done
    fi

    exit 1
else
    echo "No errors - $SUITES_PASSED suites in $GROUPS_PASSED groups passed"
    if [ $SUITES_SKIPPED -ne 0 ]; then
        echo "$SUITES_SKIPPED suites in ${#SKIPPED[*]} groups skipped"
        for ix in ${!SKIPPED[@]}
        do
            echo "    ${SKIPPED[$ix]}"
        done
    fi
    exit 0
fi
