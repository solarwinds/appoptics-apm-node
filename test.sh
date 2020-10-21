#!/bin/bash
# shellcheck disable=SC2003,SC2006 # don't mind backticks or expr

#
# script to run tests
#

#
# various tests are separated because mocha consolidates all tests in each command as one
# so they are not truly independent. e.g., every require across all tests is required at
# the start of tests. that makes it impossible to run tests without the addon loaded when
# some tests have already loaded the addon or to change the configuration once the addon
# has been initialized.
#

ERRORS=( )          # list of "GROUP test test test GROUP ..." which failed
SKIPPED=( )         # as above for tests that were skipped

GROUPS_PASSED=0
GROUPS_FAILED=0

SUITES_PASSED=0
SUITES_FAILED=0
SUITES_SKIPPED=0

# if one of the strings in SKIP is found in a test file name that file will be skipped so
# it's best to start with "test/" and provide as much of the path as possible.
# notification are disabled for now, so skip testing.
SKIP="test/solo/notifications $SKIP"

function skipThis() {
    for s in $SKIP
    do
        if [[ "$1" == *"$s"* ]]; then
            return 1
        fi
    done
    return 0
}

# if ONLY_GROUPS is not empty and the group name is not in ONLY_GROUPS then skip the group.
# this allows running only a subset of suites and, combined with SKIP, to exclude specific tests
# within that subset.
function executeGroup() {
    [ -z "$ONLY_GROUPS" ] && return 0
    for s in $ONLY_GROUPS
    do
        if [[ "$1" == "$s" ]]; then
            return 0
        fi
    done
    return 1
}

# executeTests name pattern
function executeTestGroup() {
    local group_name=$1
    local test_pattern=$2

    local group_skipped

    if ! executeGroup "$group_name"; then
        group_skipped=true
        #GROUPS_SKIPPED=`expr $GROUPS_SKIPPED + 1`
        #return
    fi

    local new_errors=""
    local new_skipped=""

    for F in $test_pattern
    do
        if [ -n "$group_skipped" ] || ! skipThis "$F"; then
            new_skipped="$new_skipped $F"
            SUITES_SKIPPED=`expr $SUITES_SKIPPED + 1`
        else
            if [ -n "$SIMULATE" ]; then
                echo "simulating test $F"
                SUITES_PASSED=`expr $SUITES_PASSED + 1`
            elif ! mocha "$F"; then
                new_errors="$new_errors $F"
                SUITES_FAILED=`expr $SUITES_FAILED + 1`
            else
                SUITES_PASSED=`expr $SUITES_PASSED + 1`
            fi
        fi
    done
    if [ -z "$new_errors" ] && [ -z "$group_skipped" ]; then
        GROUPS_PASSED=`expr $GROUPS_PASSED + 1`
    elif [ -z "$group_skipped" ]; then
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
# this group has lambda-specific tests
#
executeTestGroup "LAMBDA" "test/lambda/*.test.js"

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
[ $SUITES_PASSED -ne 1 ] && sps=s
[ $GROUPS_PASSED -ne 1 ] && gps=s
[ $SUITES_FAILED -ne 1 ] && sfs=s
[ ${#ERRORS[*]} -ne 1 ] && gfs=s
[ $SUITES_SKIPPED -ne 1 ] && sss=s
[ ${#SKIPPED[*]} -ne 1 ] && gss=s

echo "$"
if [ ${#ERRORS[*]} -ne 0 ]; then
    echo "$SUITES_PASSED suite${sps} in $GROUPS_PASSED group${gps} passed"
    echo "$SUITES_FAILED suite${sfs} in ${#ERRORS[*]} group${gfs} failed"
    for ix in "${!ERRORS[@]}"
    do
        echo "    ${ERRORS[$ix]}"
    done
    if [ $SUITES_SKIPPED -ne 0 ]; then
        echo "$SUITES_SKIPPED suite${sss} in ${#SKIPPED[*]} group${gss} skipped"
        for ix in "${!SKIPPED[@]}"
        do
            echo "    ${SKIPPED[$ix]}"
        done
    fi

    exit 1
else
    echo "No errors - $SUITES_PASSED suite${sps} in $GROUPS_PASSED group${gps} passed"
    if [ $SUITES_SKIPPED -ne 0 ]; then
        echo "$SUITES_SKIPPED suite${sss} in ${#SKIPPED[*]} group${gss} skipped"
        for ix in "${!SKIPPED[@]}"
        do
            echo "    ${SKIPPED[$ix]}"
        done
    fi
    exit 0
fi
