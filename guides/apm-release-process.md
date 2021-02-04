# appoptics-apm node releasing

### audience

This document is intended for the SolarWinds developers responsible for releasing the product.

### developing and releasing

1. CODE and COMMIT to github
    * finish feature/branch
    * update the version number in package.json by manually editing it, if not already done. this is useful
    in that the todo app (/config endpoint), the matrix output, and the benchmark metrics all include the version
    to verify that you're testing what you think you are.
    * update CHANGELOG.md if not already done.
    * execute `source env.sh bash` to set up environment for testing from bash. see `env.sh` for
    details.
    * execute `docker-compose up -d` to set up the docker components for testing. these are
    primarily database endpoints.
    * make changes and commit them.
    * N.B. mocha and eslint are globally installed in the development environment. they are not installed by executing
    `npm install` in the `appoptics-apm-node` root directory. if your setup varies take this into account.
    * if your editor does not integrate eslint then execute `npm run eslint`. regarding eslint - it's preferred to require
    semi-colons but the code has substantial chunks of code that were written without semicolons so that rule is a warning,
    not an error.
    * run tests `npm test`. It is often useful to run a subset of tests using the globally installed
    mocha, e.g.,
      - `mocha test/*.test.js` to run the basic test suite
      - `mocha test/probes/*.test.js` to test the probes
      - `mocha test/probes/fs.test.js` to test only the `fs` instrumentation.
      - `test.sh` runs groups of tests and outputs a useful summary. `npm test` executes `test.sh`.
      - the `test/lambda/remote.test.js` will fail if the version doesn't match the version of the lambda agent. run
      tests with `AO_TEST_LAMBDA_IGNORE_VERSIONS=true npm test` in order to skip the version checks. the intention of
      the check is to verify that the lambda layer installed on the remote test application matches (i.e., we're testing
      the lambda layer that we intend to).
    * install changes in local todo application using one of the two following methods and test:
      - `npm install https://api.github.com/repos/appoptics/appoptics-apm-node/tarball/test-10.1.0-rc` where `test-10.1.0-rc`
      is the branch to install.
      - create a .tgz file using `npm pack` and install that via `npm install ../path/to/appoptics-apm-x.y.z.tgz`
    * verify that the test not only apparently works but also that it creates valid traces on the collector.`env.sh`
    provides options to test against production or staging.
    * if the changes warrant it run more rigorous tests:
        - the test matrix, `appoptics/node-apm-matrix`
        - the benchmark, `appoptics/apm-benchmark-node`
    * create PR and get it reviewed (see exceptions in REMARKS below). the previous tests can run
    while the PR is being reviewed.
    * when the PR has been approved take one of two steps
      1) merge branch into master. consider squashing commits as appropriate.
      2) perform an interactive rebase on the development machine (github doesn't implement this),
      to a new branch, typically named x.y.z (the to-be-released version number without the 'v'
      prefix). The reason the branch isn't named vx.y.z is to avoid conflict with the tag that
      will be used on the release. an interactive rebase is like a selective squash where it's
      possible to reword and combine commits, but not force all commits into one.
          - push the new branch x.y.z via `git push -u origin x.y.z` and create a PR for that branch.
          - this new PR will make the previous PR obsolete but verify that the two compare without differences.
          the new PR should be exactly the same as the previous PR if the interactive rebase was done correctly;
          only the commits (number and messages) will be changed.

2. SMOKE TEST package

installing a `tgz` file is about as close to doing `npm install appoptics-apm` (from the npm repository)
as you can simulate. `npm install` fetches a `tgz` file from the npm repository. and both `npm pack` and
`npm publish` run npm prepack scripts, an important step to verify that things work.

  - verify that it is installable in a production configuration
    * use `npm pack` to create a `tgz` file.
    * do a clean install in an empty directory like `npm install ../appoptics-apm@5.2.1.tgz` and
    verify tests work (after using `env.sh` to set up environment variables).
  - verify that it installs in an application
    * clone a copy of https://github.com/appoptics/apm-node-todo as the test application (or at a minimum
    `rm -rf node_modules/*` in an existing todo installation.)
    * use npm to install from the `tgz` file, like `npm install ../path-to-apm-repo/appoptics-apm@5.2.1.tgz`
    * run `source env.sh key service-name` to set up `APPOPTICS_SERVICE_KEY`. It requires that `AO_TOKEN_STG`
    or `AO_TOKEN_PROD` is already defined so as not to hardcode the token.
    * run `source env.sh stg` in order to set up the environment to so that oboe will send to the staging server.
    * `server.js` is a simple web server with many options. see the source for details.
    * use curl or `github.com/bmacnaughton/multiload` in order to execute requests against the
    server. `multiload` can generate consistently timed loads and offers a number of different
    loads. see the help and source for details.
    * verify on `appoptics.com`, either production or staging, that the events are being received
    and are correct.

3. PRE-PUBLISH STEPS
    * create a release in `appoptics/appoptics-apm-node` and write appropriate release notes.
        * detail any breaking changes.
    * create a [Documentation Jira](https://swicloud.atlassian.net/wiki/spaces/CSS/pages/386760723/Documentation+Change+Process) as needed. this is typically
    for changes in the supported packages matrix.
    * execute `git pull` or `git fetch` followed by a merge or rebase to make sure that there
    have not been any changes to github that are not reflected in the local copy. if there have been
    changes then, depending on the changes, go back to an appropriate place in the release process.

4. PUBLISH
    * PUBLISH FROM A SOLARWINDS ACCOUNT. This is so 1) the package is published by SolarWinds
    and 2) so the final checks are done in a clean account without any development artifacts
    laying around.
    * my development machine has an appoptics account on it which i use for final testing. if you
    don't have a separate account on your computer set one up. i just open a terminal window and
    ssh into the appoptics account to get a clean context.
    * when logged into that account clone the repo, `git clone --depth 1 https://github.com/appoptics/appoptics-apm-node.git`
    * verify that `npm install` and `npm test` work correctly.
    * create a `.tgz` file using `npm pack`, go to a development machine terminal window and verify
    that the `.tgz` file can be installed and works correctly.
    * log into npm with a SolarWinds account, e.g., `npm login bruce@solarwinds.cloud` and
    publish from the root of the project using `npm publish --otp=xyzzyx`. (the one-time-password is
    required if using token-based 2fa which should be required for logging into an account that
    publishes). if it is not a production release be sure to add `--tag=rc` or `--tag=alpha` or similar.
    there are no hard and fast rules regarding `rc` or `alpha` but try to use `alpha` for a release
    that is for internal testing only and `rc` for a release that is intended for customer testing. if
    no `--tag` is specified the release will get the `latest` tag and will become the default for users
    executing the `npm install appoptics-apm` command.

5. Follow-up
    * announce new version in #ao-releases in Slack.
    * verify that you can download and install and get traces in the collector using the newly
    published package with todo app or another.

6. REMARKS
    * !!! npm packages, once published, cannot be changed, deleting a package does not make it
    possible to publish a new version with the same version number.
    * if a commit only impacts testing or files not included in a published release (excluded by
    `.npmignore`) a PR may be merged without review.

### auxillary tools

There are a number of packages that are used to facilitate testing the node agent for release.
Those that are used in the released product are enumerated in package.json's dependencies section.
But not all the packages used for more exhaustive, release-focused testing are part of the
devDependencies section.

These are:

- the todo application. this was originally google's todomvc-mongodb and was created as a simple
showcase for angular. because the changes to make it a facility to test our agent were so extensive
and of no general use the repository was cloned, and renamed, and is now [apm-node-todo](https://github.com/appoptics/apm-node-todo).
- `multiload`. this was originally developed, in very skeletal form, as part the coding challenge of
bmacnaughton's interview . this can be used to drive a mixed load of transactions against the todo
server. it's extensible but not particularly well documented. it can be found at [apm-node-multiload](https://github.com/appoptics/apm-node-multiload).
- `testeachversion`. this is derived from Stephen Belanger's `alltheversions`. it is primarily used
for the test matrix (`appoptics/node-apm-matrix`) but can be used locally for development as well (it's
particularly useful to make sure all versions work when modifying a single package's probe file).
`testeachversion` is driven by `test/versions.js` which defines the packages and versions of each
package to be tested. there are a number of command line options for selecting specific packages, changing
the location of the versions file, etc. but the primary documentation is the code. it produces two
files - a summary file and a details file. both file names include the version of node, the os, and a
timestamp. the details file contains the raw test output is helpful when investigating why tests failed;
the summary file is a JSON file that can be interpreted by `humanize` (see next bullet). It can be found in [apm-node-testeachversion](https://github.com/appoptics/apm-node-testeachversion) (this package is part of devDependencies.)
- `humanize-logs` is part of `testeachversion` and is mapped to `humanize` in the `node_modules/.bin/`
directory. it interprets the content of the summary files produced by `testeachversion` either singly
or in aggregate. various options exist and are documented in the help and, as usual, in the code.
- `github.com/appoptics/apm-benchmark-node` is a set of files to create docker containers that run
benchmarks of one version against another version to check for memory leaks, primarily, though
CPU usage can also be evaluated.
- `github.com/appoptics/apm-test-node` is a set of files for creating the matrix tests in docker containers.


### Fixing bad tags

Sometimes I tag a commit I shouldn't have. One of these might help.

  * Delete the tag on any remote before you push
    * `git push origin :refs/tags/<tagname>`
  * Replace the tag to reference the most recent commit
    * `git tag -fa <tagname>`
  * Push the tag to the remote origin
    * `git push origin master --tags`
  * it is possible to change the tag of a published version, e.g., from `latest` to `rc` if you
  accidentally forget to add the `rc` tag.
    - `npm dist-tag add @appoptics/apm-bindings@11.0.0-rc1 rc`
    - `npm dist-tag rm @appoptics/apm-bindings@11.0.0-rc1 latest`
    - there must be one `latest` tag published, so you can't do this on the first publish of a package.
