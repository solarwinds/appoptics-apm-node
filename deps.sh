#!/bin/sh

# don't even try install these in production
[ "$NODE_ENV" = "production" ] && exit 0

# they're all optional, so ignore failures
{
    npm install oracledb@2.2.0
} || {
    echo "unable to install optional oracledb package"
}

# pg-native doesn't build on alpine so don't try
[ "$OS_SPEC" = "alpine" ] && exit 0

{
    npm install pg-native@2.2.0
} || {
    echo "unable to install optional pg-native package"
}
