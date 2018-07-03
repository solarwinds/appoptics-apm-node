#!/bin/sh

# don't even try install these in production
[ "$NODE_ENV" = "production" ] && exit 0

# they're all optional, so ignore failures
{
    npm install oracledb@0.3.1
} || {
    echo "unable to install optional oracledb package"
}

{
    npm install pg@4.5.7
} || {
    echo "unable to install optional pg package"
}

{
    npm install pg-native@1.10.0
} || {
    echo "unable to install optional pg-native package"
}
