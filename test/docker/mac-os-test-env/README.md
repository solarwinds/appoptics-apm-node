# Running Tests and Debugging on Mac

The node agent uses bindings from a c-library, that doesn't compile on MacOS.
Therefor we need to run the tests in a docker container.
Furthermore the tests require access to a number of databases and services, 
which will also run in containers with the setup provided here.

## Preconditions
The environment variable `AO_TOKEN_STG` needs to be set and can be set to 
something like `1234567890123456789012345678901234567890123456789012345678901234` 
(length must be 64 characters, allowed characters A-Za-z0-9)

A real token is only needed if debugging involves looking at traces in 
`https://my-stg.appoptics.com/`.

## Starting the containers

The command

`./dc.sh test`

will start all the necessary containers and a network, that makes it possible 
for the `node_main` container to access databases and services.

This command puts the user into a bash shell in the `node_main` container. 
This container mounts the code from the `appoptics-apm-node` directory on the 
host. The code can be edited in the usual IDE and the changes tested in the 
`node_main` container without having to restart or reload.

## Testing

In the shell in `node_main` type `mocha` or `mocha <path-to-test-file>` to 
run tests. To run all tests `mocha test/probes/*.test.js`

This warning can be ignored: `appoptics:warn environment variables not recognized: APPOPTICS_REPORTER_UDP=localhost:7832, APPOPTICS_TOKEN_BUCKET_RATE=1000, APPOPTICS_TOKEN_BUCKET_CAPACITY=1000`


## Debugging

In the shell in `node_main` type `debug` or `debug <path-to-test-file>` to 
start tests in debug mode. Then go to a Chrome browser window and open 
`chrome://inspect` to access the debugging tools.
Breakpoints can be set in Chrome or by adding a line `debugger` in the code.

## Other `./dc.sh` commands
`./dc.sh config`  shows the whole docker-compose configuration
`./dc.sh down` stops the containers and removes orphans
`./dc.sh logs` streams the logs from all containers
`./dc.sh ps` calls `docker-compose ps` (more compact and focussed than docker ps)
