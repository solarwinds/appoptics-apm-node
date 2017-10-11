# Contributing

## Dev environment

The dev environments for [appoptics](https://github.com/librato/node-appoptics)
and [appoptics-bindings](https://github.com/librato/node-appoptics-bindings)
consist of a [vagrant](https://www.vagrantup.com/) virtual machine with
liboboe/tracelyzer and latest stable version of node installed. It reports
to the [stephenappneta](http://stephenappneta.tv.solarwinds.com) organization.

### Setup

To start the dev environment, ensure vagrant and virtualbox are installed, then
you can simply run `vagrant up` to start the environment and `vagrant ssh` to
connect to it.

The appoptics `Vagrantfile` also includes a collection of docker containers,
defined in the `docker-containers.json` file. Note that, while this is intended
to be run using the vagrant docker configuration, I've also included a file
named `docker.rb` which allows the container list to be set up directly on any
system with docker already installed.

### Pointing to QA supporting services

In the event that you need to point tests at the QA support service databases,
you can configure the environment variables set in the `Vagrantfile` and
rebuild the container.

## Testing

### Running the basic test suite

The full test suite can be run inside `/vagrant` on the virtual machine using
`gulp test`. You can also run the API unit tests with `gulp test:unit` or run
the probe integration tests with `gulp test:probes`. If you want to run the
tests for a specific module, you can do that too by running
`gulp test:probe:${module}`.

While developing a branch for the move from Traceview to AppOptics the repo
is not public. In order to fetch from a private repo it is necessary to
provide credentials of some sort. So `install-appoptics-bindings.js` is a
`preinstall` script. The environment variable `AO_TEST_PACKAGE` specifies
the source of the `node-appoptics-bindings` package because `npm` will, by
default, fetch the head of the master branch. In order to authorize for the
private repository use either the environment variable `AO_TEST_GITAUTH` (a
git Personal Access Token [tokens]) or use both `AO_TEST_GITUSER` and
`AO_TEST_GITPASS`. Otherwise it is assumed that it is fetching a public
repository and uses no auth.

The tests are done using a mock UDP server that receives the messages from
`liboboe`. It is hardwired, in `test/helper.js`, to use port 7832. for this
to work these environment variables must be set:
- APPOPTICS_REPORTER=udp
- APPOPTICS\_REPORTER_UDP=localhost:7832

NOTE: The testing environment has been moved to Docker using `docker-compose`
and `docker-compose.yml`. Vagrant has not been updated but neither has this doc.

[tokens]: https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/

### Running the support matrix test suite

The support matrix test suite runs the tests for a given module against every
supported version of that module, down to patch releases. Note that this can
take a *very* long time!

You can run the full support matrix test suite with `gulp support-matrix`,
but generally you are better off scoping to a module by simply running
`gulp support-matrix:${module}`

### Running the test suite with code coverage analysis

Any test task can be run with code coverage analysis by simply replacing the
`test:` prefix with `coverage:`. Note that coverage from the full test suite
will show the best coverage numbers because subsections of the test suite may
not exercise particular areas. It's useful to be able to do subsection analysis
though, as it can help to spot areas that *should* be exercised, but are not.

## Benchmarking

### Running the benchmark suite

Similar to the test suite running options, there are also `gulp bench`,
`gulp bench:unit`, `gulp bench:probes` and numerous `gulp bench:probe:*` tasks.

## Docs

The repo includes code comment based API docs, which can be generated with
`gulp docs`.

## Project layout

Individual module instrumentation can be found in `lib/probes/${module}.js`,
while the corresponding tests can be found at `test/probes/${module}.test.js`
and benchmarks can be found at `test/probes/${module}.bench.js`.

The default config values are all described in `lib/defaults.js`, and get
applied to the core module that exposes the custom API in `lib/index.js`.
The lower-level `Layer`, `Profile` and `Event` types are described in
`lib/layer.js`, `lib/profile.js` and `lib/event.js`.

The patching mechanism works by intercepting `require(...)` calls in
`lib/require-patch.js`. The require patch interface includes a `register(...)`
function, which could be useful for testing patches outside of the appoptics
module before merging into the core project.

RUM injection code lives in `lib/rum.js`, while the templates for it live in
the `rum-templates` folder.

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
I've used `npm version patch|minor|major` for this, but it can be done manually
if you prefer.

After the version bump commit has been made, make sure it is tagged and push the
commit and tags to git. Note that `npm version *` creates the tag itself, so
you can skip that step if you use it.

After all commits and tags have been pushed to git, it's simply a matter of
running `npm publish` to send the latest version to the npm registry.
