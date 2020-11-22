#!/bin/sh

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

ERRORS=""          # list of "GROUP test test test GROUP ..." which failed
errorCount=0
SKIPPED=""         # as above for tests that were skipped
skipCount=0

addError() {
  ERRORS="$ERRORS $1"
  errorCount=$((errorCount + 1))
}
addSkip() {
  SKIPPED="$SKIPPED $1"
  skipCount=$((skipCount + 1))
}

GROUPS_PASSED=0
GROUPS_FAILED=0

SUITES_PASSED=0
SUITES_FAILED=0
SUITES_SKIPPED=0

# if one of the strings in SKIP is found in a test file name that file will be skipped so
# it's best to start with "test/" and provide as much of the path as possible.
# notification are disabled for now, so skip testing.
SKIP="test/solo/notifications $SKIP"

skipThis() {
  for s in $SKIP
  do
    case $1 in
      *"$s"*) return 1
    esac
  done
  return 0
}

# if ONLY_GROUPS is not empty and the group name is not in ONLY_GROUPS then skip the group.
# this allows running only a subset of suites and, combined with SKIP, to exclude specific tests
# within that subset.
executeGroup() {
  [ -z "$ONLY_GROUPS" ] && return 0
  for s in $ONLY_GROUPS
  do
    if [ "$1" = "$s" ]; then
      return 0
    fi
  done
  return 1
}

# executeTests name pattern
executeTestGroup() {
    _group_name=$1
    _test_pattern=$2

    _group_skipped

    if ! executeGroup "$_group_name"; then
        _group_skipped=true
    fi

    _new_errors=""
    _new_skipped=""

    for F in $_test_pattern
    do
        if [ -n "$_group_skipped" ] || ! skipThis "$F"; then
            _new_skipped="$_new_skipped $F"
            SUITES_SKIPPED=$((SUITES_SKIPPED + 1))
        else
            if [ -n "$SIMULATE" ]; then
                echo "simulating test $F"
                SUITES_PASSED=$((SUITES_PASSED + 1))
            elif ! mocha "$F"; then
                _new_errors="$_new_errors $F"
                SUITES_FAILED=$((SUITES_FAILED + 1))
            else
                SUITES_PASSED=$((SUITES_PASSED + 1))
            fi
        fi
    done
    if [ -z "$_new_errors" ] && [ -z "$_group_skipped" ]; then
        GROUPS_PASSED=$((GROUPS_PASSED + 1))
    elif [ -z "$_group_skipped" ]; then
        GROUPS_FAILED=$((GROUPS_FAILED + 1))
        addError "$_group_name:$_new_errors"
    fi
    if [ -n "$_new_skipped" ]; then
        addSkip "$_group_name:$_new_skipped"
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
[ $errorCount -ne 1 ] && gfs=s
[ $SUITES_SKIPPED -ne 1 ] && sss=s
[ $skipCount -ne 1 ] && gss=s

if [ -t 1 ]; then
    NC='\033[0m'
    RED='\033[1;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
else
    NC=''
    RED=''
    GREEN=''
    YELLOW=''
fi

echo "$"
# shellcheck disable=2059
if [ ${#ERRORS[*]} -ne 0 ]; then
    printf "${GREEN}$SUITES_PASSED suite${sps} in $GROUPS_PASSED group${gps} passed${NC}\n"
    printf "${RED}$SUITES_FAILED suite${sfs} in $errorCount group${gfs} failed${NC}\n"
    for error in $ERRORS
    do
        printf "${RED}    $error${NC}\n"
    done
    if [ $SUITES_SKIPPED -ne 0 ]; then
        printf "${YELLOW}$SUITES_SKIPPED suite${sss} in $skipCount group${gss} skipped${NC}\n"
        for skip in $SKIPPED
        do
            printf "${YELLOW}    $skip${NC}\n"
        done
    fi

    exit 1
else
    printf "${GREEN}No errors - $SUITES_PASSED suite${sps} in $GROUPS_PASSED group${gps} passed${NC}\n"
    if [ $SUITES_SKIPPED -ne 0 ]; then
        printf "${YELLOW}$SUITES_SKIPPED suite${sss} in $skipCount group${gss} skipped${NC}\n"
        for skip in $SKIPPED
        do
            printf "${YELLOW}    $skip${NC}\n"
        done
    fi
    exit 0
fi
