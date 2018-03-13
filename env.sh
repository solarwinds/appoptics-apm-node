ARG=$1
PARAM=$2

if [[ -z "$AO_TOKEN_STG" ]]; then
    echo "AO_TOKEN_STG must be defined and contain a valid token"
    echo "for accessing collector-stg.appoptics.com"
elif [[ -z "$ARG" ]]; then
    echo "source this script with an argument of docker or bash"
    echo "docker defines variables for the docker environemnt testing"
    echo "bash defines variables to run at a native command prompt"
    echo
    echo "you may also use the argument debug to define additional"
    echo "debugging variables, bindings to define alternate ao-bindings"
    echo "authentication and package, or tcpdump to get help on tcpdump"
elif [[ "$ARG" = "docker" ]]; then
    export APPOPTICS_REPORTER_UDP=localhost:7832
    export APPOPTICS_TRUSTEDPATH=/appoptics/test/certs/java-collector.crt
    export APPOPTICS_COLLECTOR=java-collector:12222
    export APPOPTICS_SERVICE_KEY=${AO_TOKEN_STG}:ao-node-test-docker
    # need to change next line to ssl to use java-collector
    export APPOPTICS_REPORTER=udp
elif [[ "$ARG" = "docker-scribe" ]]; then
    export APPOPTICS_REPORTER_UDP=localhost:7832
    export APPOPTICS_TRUSTEDPATH=/appoptics/test/certs/scribe-collector.crt
    export APPOPTICS_COLLECTOR=scribe-collector:4444
    export APPOPTICS_SERVICE_KEY=${AO_TOKEN_STG}:ao-node-test-docker
    # need to change next line to ssl to use scribe collector
    export APPOPTICS_REPORTER=udp
elif [[ "$ARG" = "bash" ]]; then
    export APPOPTICS_REPORTER_UDP=localhost:7832
    export APPOPTICS_COLLECTOR=collector-stg.appoptics.com
    export APPOPTICS_SERVICE_KEY=${AO_TOKEN_STG}:ao-node-test
    # set this to ssl in order to use APPOPTICS_COLLECTOR
    export APPOPTICS_REPORTER=udp
elif [[ "$ARG" = "bash-testing" ]]; then
    # presume docker containers are running - their ports are addressable
    # as localhost.
    export AO_TEST_CASSANDRA_2_2=localhost:9042
    export AO_TEST_MEMCACHED_1_4=localhost:11211
    export AO_TEST_MONGODB_2_4=localhost:27016
    export AO_TEST_MONGODB_2_6=localhost:27017
    export AO_TEST_MONGODB_3_0=localhost:27018
    export AO_TEST_MYSQL=localhost:3306
    export AO_TEST_MYSQL_USERNAME=admin
    export AO_TEST_MYSQL_PASSWORD=pwwadmin
    # this requires an entry in /etc/hosts because this
    # isn't run in a container it can't use docker names.
    # use the IP address from "docker inspect ao_oracle_1"
    export AO_TEST_ORACLE=oracledb.com
    export AO_TEST_ORACLE_USERNAME=system
    export AO_TEST_ORACLE_PASSWORD=oracle
    # defaults should be fine.
    #export AO_TEST_POSTGRES_USER=postgres
    #export AO_TEST_POSTGRES_PASSWORD=
    export AO_TEST_POSTGRES=localhost:5432
    export AO_TEST_RABBITMQ_3_5=localhost:5672
    export AO_TEST_REDIS_3_0=localhost:6379
    # the tedious probe tests SQL Server.
    export AO_TEST_SQLSERVER_EX=localhost:1433
elif [[ "$ARG" = "debug" ]]; then
    export APPOPTICS_DEBUG_LEVEL=6
    # see src/debug-loggers.js for all the options
    export DDEBUG=appoptics:flow,appoptics:metadata,appoptics:test:message

    # Turn on the requestStore debug logging proxy (should work with fs now
    # that logging uses in memory logger if stdout or stderr are not a TTY.
    #export AO_TEST_REQUESTSTORE_PROXY=1
elif [[ "$ARG" = "bindings" ]]; then
    # use these to provide authentication and specify an alternate branch/tag
    # for the install-appoptics-bindings.js script.
    # N.B. if fetching from packagecloud setting the next two are a good
    # alternative as packagecloud's proxy doesn't have authorization issues
    # when they are installed in a project .npmrc file, not the user .npmrc
    # file.
    export AO_TEST_PACKAGE=librato/node-appoptics-bindings#per-request-v2
    # this requires that one's git access token is already defined.
    export AO_TEST_GITAUTH=${AO_TOKEN_GIT}
elif [[ "$ARG" = "help" ]]; then
    echo "try"
    echo "    $ sudo tcpdump -i lo -n udp port 7832"
    echo "to watch the UDP traffic"
    #sudo tcpdump -i lo -n udp port 7832
else
    echo "ERROR $ARG invalid"
fi

return




