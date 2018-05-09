# Contributing

## Dev environment

The dev environment for [appoptics-apm](https://github.com/appoptics/appoptics-apm-node) requires node (version 4+), docker, and a bash shell. It's generally easiest to work at a bash command prompt for editing and running tests from that prompt that interact with exposed ports from the docker containers created by the `docker-compose.yml` file.


### Setup

The primary environment for testing is Docker. Unit tests can be run without docker but probe testing requires databases and servers to test against. `docker-compose.yml` defines a complete environment for testing. It depends on `collectors` that are defined in a directory parallel to to this directory. For example, if this (the
appoptics-apm-node directory) is `/solarwinds/ao` then the oboe-test repository must be cloned into `/solarwinds/oboe-test/` because `docker-compose.yml` references those docker files via `../oboe-test/`

`env.sh` is desiged to be sourced, `$ source env.sh <args>` in order to set up environment variables for different testing scenarios.

It's typically easiest to work at the bash shell and test against docker containers. That is the method that the rest of this document focuses on.

## Testing

### Running the basic test suite

In order to run the full test suite various databases are required so that instrumentation for the database drivers can be tested. The test environment is created by first executing the bash command `source env.sh bash-testing` and then executing `docker-compose up -d`.

beta note: `docker-compose.yml` references docker via `../oboe-test/` that are not available yet. The `java-collector` and `scribe-collector` containers will not be found.

With that in place, the full suite of tests can be run using `npm test`. It is also possible to run subsets of the tests by directly invoking gulp, e.g., `./node_modules/gulp/bin/gulp.js test:unit` to run only the unit tests or `./node_modules/gulp/bin/gulp.js test:probes` to run just the probes. More useful is the ability to test only one probe, `./node_modules/gulp/bin/gulp.js test:probe:mysql`.

There is also a `main` container created that can be used as a clean-room environment for testing. So if we have put the `appoptics-apm-node` code in the `ao` directory (because it is short and concise) docker will create the container `ao_main_1` as a default name. To use that, presuming the `docker-compose up -d` command has already been executed:

1. `docker exec -it ao_main_1 /bin/bash` - get a command prompt in the container
2. `cd appoptics` - change to the appoptics directory
3. `npm install` - to install the package and dependencies
4. `source env.sh docker` - to setup the java-collector (beta note: the "docker" arg needs to be updated)
5. run tests using `npm test` or `./node_modules/gulp/bin/gulp.js test[:unit|probes|probe:${module}]`


For testing, a mock reporter that listens on UDP port 7832 is used. When you source `env.sh` it will set environment variables appropriately. It does require that `AO_TOKEN_STG` exists in your environment. That is the service key that is used for access.  If using the java-collector or scribe-collector the key can be fake, like `f08da708-7f1c-4935-ae2e-122caf1ebe31`. If accessing a production environment it must be a valid key.


It is possible to use non-production versions of the `appoptics-bindings` package when developing. There are many different ways to do so ranging from npm's `link` command, manually copying files, and many options embedded in the npm `postinstall` script, `install-appoptics-bindings.js`. The primary documentation for this advanced feature is the code.


The tests are done using a mock UDP server that receives the messages from the agent. This allows the test code to intercept the messages and check them for correctness. It is hardwired, in `test/helper.js`, to use port 7832. This requires that these environment variables must be set:
- APPOPTICS\_REPORTER=udp
- APPOPTICS\_REPORTER_UDP=localhost:7832


### Running the support matrix test suite

(beta note: this is not yet functional)

The support matrix test suite runs the tests for a given module against every
supported version of that module, down to patch releases. Note that this can
take a *very* long time!

You can run the full support matrix test suite with `gulp support-matrix`,
but generally you are better off scoping to a module by simply running
`gulp support-matrix:${module}`

### Running the test suite with code coverage analysis

(beta note: this is not yet functional)

Any test task can be run with code coverage analysis by simply replacing the
`test:` prefix with `coverage:`. Note that coverage from the full test suite
will show the best coverage numbers because subsections of the test suite may
not exercise particular areas. It's useful to be able to do subsection analysis
though, as it can help to spot areas that *should* be exercised, but are not.

## Benchmarking

(beta note: this is not yet functional)

### Running the benchmark suite

Similar to the test suite running options, there are also `gulp bench`,
`gulp bench:unit`, `gulp bench:probes` and numerous `gulp bench:probe:*` tasks.

## Docs

(beta note: this is not yet functional)

The repo includes code comment based API docs, which can be generated with
`gulp docs`.

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

If necessary, a staging branch is used to merge features to before targeting
master, but this is generally avoided. This mostly only comes up when multiple
unrelated changes need to be made to the same file, which could potentially
produce merge conflicts. In practice, this generally only comes up when I try
to refactor core components.

### Releasing

When you are ready to release, rebase your branches off master, run the tests,
then merge to master and repeat for subsequent branches. When all the things
planned for release have been merged to master, create a version bump commit.
I've used `npm version major.minor.patch` for this, but it can be done manually
if you prefer.

After the version bump commit has been made, make sure it is tagged and push the
commit using `git push origin <tag-name>`. This pushes the tagged commit and the tag. If
you just `git push` the tag will not be pushed. Note that `npm version` creates the
tag in git; you don't need to create it manually.

After all commits and tags have been pushed to git, it's simply a matter of
running `npm publish` to send the latest version to the npm registry.

