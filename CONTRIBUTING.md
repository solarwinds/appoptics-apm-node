Table of Contents
=================

* [Contributing](#contributing)
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

## Dev environment

The dev environment for [appoptics-apm](https://github.com/appoptics/appoptics-apm-node) requires node (version 4+), docker, and a bash shell. It's generally easiest to work at a bash command prompt for editing and running tests from that prompt that interact with exposed ports from the docker containers created by the `docker-compose.yml` file.


### Setup

The primary environment for testing is Docker. Unit tests can be run without docker but probe testing requires databases and servers to test against. `docker-compose.yml` defines a complete environment for testing.

`env.sh` is desiged to be sourced,

`$ source env.sh <args>` in order to set up environment variables for different testing scenarios.

It's typically easiest to work at the bash shell and test against docker containers. That is the method that the rest of this document focuses on.

## Testing

### Running the basic test suite

In order to run the full test suite various databases are required so that instrumentation for the database drivers can be tested. The test environment is created by first executing the bash command `source env.sh bash` and then executing `docker-compose up -d`. This two steps will set environment variables and bring up docker containers that provide services (mostly databases) needed by the test suite.

beta note: `docker-compose.yml` references docker via `../oboe-test/` that are not available yet. The `java-collector` and `scribe-collector` containers will not be found.

With that in place, the full suite of tests can be run using `npm test`. It is also possible to run subsets of the tests by directly invoking gulp, e.g., `gulp test:unit` to run only the unit tests or `gulp test:probes` to run just the probes. More useful is the ability to test only one probe, `gulp test:probe:mysql`. N.B. `gulp` is directly referenceable because `./node_modules/.bin` was added to `PATH` by `source env.sh bash`.

There is also a `main` container created that can be used as a clean-room environment for testing. So if we have put the `appoptics-apm-node` code in the `ao` directory (because it is short and concise) docker will create the container `ao_main_1` as a default name. To use that, presuming the `docker-compose up -d` command has already been executed:

1. `docker exec -it ao_main_1 /bin/bash` - get a command prompt in the container
2. `cd appoptics` - change to the appoptics directory
3. `npm install` - to install the package and dependencies
4. `source env.sh docker-java` - to setup the java-collector (beta note: the "docker" arg needs to be updated)
5. `source env.sh add-bin` - to add the node_module executables to the path
5. run tests using `npm test` or `gulp.js test[:unit|probes|probe:${module}]`


For testing, a mock reporter that listens on UDP port 7832 is used (hardcoded in `test/helper.js`). The mock reporter intercepts UDP messages and checks them for correctness. When you source `env.sh` it will set environment variables appropriately. It does require that `AO_TOKEN_STG` exists in your environment. That is the service key that is used for access.  If using the java-collector or scribe-collector the key can be fake, like `f08da708-7f1c-4935-ae2e-122caf1ebe31`. If accessing a production or staging environment it must be a valid key.


It is possible to use non-production versions of the `appoptics-bindings` package when developing. There are many different ways to do so ranging from npm's `link` command, manually copying files, and many options embedded in the npm `postinstall` script, `install-appoptics-bindings.js`. The primary documentation for this advanced feature is the code.


## Docs

The repo includes code comment based API docs, which can be generated with
`npm docs`.

## Project layout

Individual module instrumentation can be found in `lib/probes/${module}.js`,
while the corresponding tests can be found at `test/probes/${module}.test.js`
and benchmarks can be found at `test/probes/${module}.bench.js`.

The default config values are all described in `lib/defaults.js`, and get
applied to the core module that exposes the custom API in `lib/index.js`.
The lower-level `Span`, `Profile` and `Event` types are described in
`lib/span.js`, `lib/profile.js` and `lib/event.js`.

The patching mechanism works by intercepting `require(...)` calls in
`lib/require-patch.js`. The require patch interface includes a `register(...)`
function, which could be useful for testing patches outside of the appoptics
module before merging into the core project.

Tests live in the `test` directory, with a `test/probes` subdirectory for tests
specific to a given instrumented module. The file in `test` follow a naming
scheme of `${name}.test.js` for files intended to be run by the test runner,
`${name}.bench.js` for files intended to be run the benchmark runner, and files
with the normal scheme of `${name}.js` are just meant to be used by other files
in the test directory.

## Process

### Building

The code is written in ES6 and uses [Babel](http://babeljs.io) to transpile it
for old node versions. You can trigger this build manually with `gulp build`.
However, the build task gets triggered automatically by any test, benchmark,
coverage, or support-matrix task and is also included as a prepublish step in
`package.json`, so you should probably never need to trigger it yourself.

(beta note: the following need to be moved to internal release process notes)

### Developing

The development process thus far has involved maintaining separate branches
for each feature, which get rebased from master before a squash or merge back
to master, depending on complexity (ie: need to keep commits separate).

I'm finding that creating a staging branch before merging to master makes testing
easier; if only one branch is being merged it is effectively its own staging branch.
See the releasing section below for more on why the staging branch is useful.

Documentation changes, changes to testing, and changes to the development
environment are often committed directly to master.

### Testing

This is an abbreviated version of the testing section above so that it falls in the
develop, test, release sequence.

The most basic testing requires that various backend servers are available; these are
supplied using docker. In the `appoptics-apm-node` root directory run:

`docker-compose up -d`

to start the containers needed for testing.

Next use `env.sh` to setup the environment variables correctly. `env.sh` requires that
the `AO_TOKEN_STG` environment variable be defined as holding the secret token portion
(the part before `:service-name`) of `APPOPTICS_SERVICE_KEY`.

`env.sh` defines environment variables for the testing modules; it must be sourced,
not invoked as an executable. To setup the environment for the `npm test` command run


`. env.sh bash`.

The primary documentation for `env.sh` is the file itself.

After `. env.sh bash` you should be able to run the test suite using `npm test`. You can
also use gulp directly to choose specific tests like `gulp test:unit` or `gulp test:probes`
or even a single specific test with `gulp test:probe:generic-pool`.

### Releasing

When you are ready to release, create a staging branch (name n.n.n - the intended version
of the release) from master, rebase your branch(es) off the staging branch, run the local
tests, and repeat for any additional branch(es). If there is only one branch then it may
be used instead of creating a staging branch.

When all items planned for the release have been incorporated into the staging branch then
run additional some additional tests. At a minimum, start with a clean copy of the repository
and run the test suite again. This will catch missing dependencies that may still be in the
`node_modules` directory in a development area. So, in some directory,

```
git clone --depth=1 https://github.com/appoptics/appoptics-apm-node clean-apm
cd clean-apm
git checkout n.n.n     # the branch name
npm install
npm test               # presumes the docker environment for testing (see above).
```

If the change is significant you may need to run the support matrix again. That's beyond
the scope of this document but involves testing appoptics against each released version
of each package.

As an extra precaution it is useful to test this in a real-world test harness. I use
https://github.com/bmacnaughton/todomvc-mongodb. In the the `clean-apm` directory use
`npm pack` to make a `.tgz` file, copy that to the `todomvc-mongodb` directory, change
`package.json` for the `appoptics-apm` dependency to reference the `.tgz` file, install
using `npm install`, setup the environment with `. env.sh stg` (works against the staging
server - you might use another key), and run the server with `node server.js --fe_ip=localhost:port`.
Use curl or a browser to execute requests against the server then check the Appoptics
dashboard to make sure the traces appear and look good. The source, `server.js`, is the
only documentation for the supported transactions.

Once testing has been done and you are confident that the release works, then merge the
staging branch to master, create a version bump commit. I use `npm version major.minor.patch`
but if can be done manually if you prefer. The `npm` command updates `package.json` with the
new version.

After all commits and tags have been pushed to git, it's simply a matter of running `npm publish`
to send the latest version to the npm registry. Note that your account should have 2FA authentication
enabled for publishing. The default `npm` distributed with node 6 doesn't support that so I release
using node 8. The command `npm publish --otp=dddddd` adds the one-time password required. If the
release is non-production, i.e., `-beta.1` or `-rc.1`, etc., then be sure to add `--tag beta` or
`--tag rc`. If no tag is supplied then it gets the default `latest` and any user doing an install
will get that version (not usually desired for release-candidates).
