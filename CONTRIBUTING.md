Table of Contents
=================

* [Contributing](#contributing)
  * [Certificate of Origin](#certificate-of-origin)
  * [Dev environment](#dev-environment)
    * [Setup](#setup)
  * [Testing](#testing)
    * [Running the basic test suite](#running-the-basic-test-suite)
  * [Docs](#docs)
  * [Project layout](#project-layout)
  * [Process](#process)
    * [Building](#building)
    * [Developing](#developing)
    * [Testing](#testing-1)
    * [Releasing](#releasing)

# Contributing

## Certificate of origin

Ours is the same as node's:

By making a contribution to this project, I certify that:

a) The contribution was created in whole or in part by me and I have the right to submit it under the open source license indicated in the file; or

b) The contribution is based upon previous work that, to the best of my knowledge, is covered under an appropriate open source license and I have the right under that license to submit that work with modifications, whether created in whole or in part by me, under the same open source license (unless I am permitted to submit under a different license), as indicated in the file; or

c) The contribution was provided directly to me by some other person who certified (a), (b) or (c) and I have not modified it.

d) I understand and agree that this project and the contribution are public and that a record of the contribution (including all personal information I submit with it, including my sign-off) is maintained indefinitely and may be redistributed consistent with this project or the open source license(s) involved.

## Dev environment

The dev environment for [appoptics-apm](https://github.com/appoptics/appoptics-apm-node) requires
node (12+ preferred), docker and docker-compose, and a bash shell. It's generally easiest to work at a bash
command prompt for editing and running tests from that prompt that interact with exposed ports from
the docker containers created by the `docker-compose.yml` file.

You should follow the eslint configuration in `.eslintrc.json`. The `semi` rule is just a warning because many files
were written with a no-semicolon style but all new code should adhere to the rule.


### Setup

The primary environment for testing is Docker. Unit tests can be run without docker but probe testing
requires databases and servers to test against. `docker-compose.yml` defines a complete environment for
testing.

`env.sh` is desiged to be sourced:

`$ source env.sh <args>` in order to set up environment variables for different testing scenarios.

It's typically easiest to work at the bash shell and test against docker containers. That is the method
that the rest of this document focuses on. If you are not running linux then you can't install/build
appoptics-bindings, a dependency. Refer to `test/docker/mac-os-test-env` for details on using a mac.

## Testing

### Running the basic test suite

In order to run the full test suite various databases are required so that instrumentation for the database
drivers can be tested. The test environment is created by first executing the bash command
`source env.sh bash` and then executing `docker-compose up -d`. These two steps will set environment
variables and bring up docker containers that provide services (mostly databases) needed by the test suite.

With that in place, the full suite of tests can be run using `npm test`. Each test resides in a file name
ending in `.test.js` so it is possible to run subsets of the tests by directly invoking mocha, e.g.,
`mocha test/custom.test.js`, `mocha test/*.test.js`, or `mocha test/probes/*.test.js`. Note that `npm test`
invokes a shell script because `mocha` loads all the tests once and some tests must be run independently.
The `test.sh` file shows what all the tests are.

For testing, a mock reporter that listens on UDP port 7832 is used (hardcoded in `test/helper.js`). The
mock reporter intercepts UDP messages and checks them for correctness. When you source `env.sh` it will set
environment variables appropriately. It does require that `AO_TOKEN_STG` or `AO_TOKEN_PROD` is defined in
your environment. That is the service key that is used for access.  If using the java-collector the key can
be fake, like `f08da708-7f1c-4935-ae2e-122caf1ebe31`. If accessing a production or staging environment it must
be a valid key.


It is possible to use non-production versions of the `appoptics-bindings` package when developing. There
are different ways to do accomplish this ranging from npm's `link` command to manually copying files.

### Testing against all supported versions of the package

When a probe has been updated all supported versions of a package must be tested. The package `testeachversion`
facilitates this. `test/versions.js` defines the supported versions for each package we supply probes for. `testeachversion`
uses this file by default. To test all supported versions of a given package use the command:

`node_modules/.bin/testeachversion -p package-name`

If you don't specify the `-p package-name` option, all supported versions of all packages will be tested. That
takes a while. `testeachversion` writes two files, a details file and a summary file. More information and options
is available via `testeachversion -h`. Another file packaged with `testeachversion` is `humanize-logs` (`humanize`
in the `.bin` directory). It reads the summary file and outputs a more readable format.


## Docs

The repo includes code comment based API docs, which can be generated with
`npm docs`.

## Project layout

```
lib/                # core modules that implement the agent
lib/probes          # code that patches auto-instrumented modules
test/               # mocha test suite
test/certs/         # certs for communicating with java-collector
test/docker/        # docker files for test environments
test/java-collector # local collector usable for testing
test/probes/        # tests for probes
test/<other-dir>/   # subgroup of tests
test/utility/       # utility for finding problem with a hanging test
```

`lib/get-unified-config.js` handles configuration, pulling from the config
file and the environment. `lib/probe-defaults.js` exports the defaults for
probes. `lib/index.js` is the startup code.

Individual module instrumentation can be found in `lib/probes/${module}.js`,
while the corresponding tests can be found at `test/probes/${module}.test.js`,
and supporting components, if present, are in `test/probes/${module}/`.

## 2 minute overview

`/lib/index.js` runs when the user's code requires `appoptics-apm`. It uses
`lib/get-unified-config.js` to determine the configuration and sets up the
agent. Eventually it reads the files in `lib/probes` and enables patching.

The patching mechanism works by intercepting `require(...)` calls. It is in
`lib/require-patch.js`.

Tests live in the `test` directory, with a `test/probes` subdirectory for tests
specific to a given instrumented module. The file in `test` follow a naming
scheme of `${name}.test.js` for files intended to be run by the test runner,
files with the normal scheme of `${name}.js` are just meant to be used by other files
in the test directory.

## Process

### Baseline

The code is written with JavaScript features supported by node v8 and above. At this
time the lowest version of node officially supported in v10, so additional features
maybe be used going forward.

### Testing

mocha is not a devDependency because mocha is a installed globally in our
development environment.

The most basic testing requires that various backend servers are available; these are
supplied using docker. In the `appoptics-apm-node` root directory run:

`docker-compose up -d`

to start the containers needed for testing.

Next use `env.sh` to setup the environment variables correctly. `env.sh` requires that
the `AO_TOKEN_PROD` environment variable be defined as holding the secret token portion
(the part before `:service-name`) of `APPOPTICS_SERVICE_KEY`.

`env.sh` defines environment variables for the testing modules; it must be sourced,
not invoked as an executable. To setup the environment for the `npm test` command run

`. env.sh bash`.

The primary documentation for `env.sh` is the file itself. Using the `bash` argument places
the `node_modules/.bin/` directory in your path in addition to defining the environment
variables needed for the tests to run against the docker compose environment.

After `. env.sh bash` you should be able to run the test suite using `npm test`. You can
selectively run tests using `mocha test/basics.test.js`, `mocha test/*.test.js`,
`mocha test/**/*.test.js`, and any other variations that mocha supports. This is especially
useful for debugging using something like `mocha --inspect-brk test/probes/http.test.js`.

### Pull Requests

When your changes pass testing, including any new tests required to verify your changes
and documentation if appropriate, issue a PR. We'll try to take a prompt look and get back
to you quickly.
