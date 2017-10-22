# AppOptics

[![Travis branch](https://img.shields.io/travis/tracelytics/node-traceview/master.svg?maxAge=2592000&style=flat-square)](https://travis-ci.org/tracelytics/node-traceview/)
[![David](https://img.shields.io/david/tracelytics/node-traceview.svg?maxAge=2592000&style=flat-square)](https://david-dm.org/tracelytics/node-traceview)
[![Code Climate](https://img.shields.io/codeclimate/github/kabisaict/flow.svg?maxAge=2592000&style=flat-square)](https://codeclimate.com/github/tracelytics/node-traceview/)
[![npm](https://img.shields.io/npm/dm/traceview.svg?maxAge=2592000&style=flat-square)](https://www.npmjs.com/package/traceview)
[![npm](https://img.shields.io/npm/v/traceview.svg?maxAge=2592000&style=flat-square)](https://www.npmjs.com/package/traceview)

The `appoptics` module provides [AppOptics](https://traceview.solarwinds.com/) instrumentation for Node.JS.

It has the ability to report performance metrics on an array of libraries,
databases and frameworks.

It requires an [AppOptics](https://traceview.solarwinds.com/) account to
view metrics.  Get yours; [it's free](https://traceview.solarwinds.com/TraceView/Signup).

## Dependencies

- Linux
- node.js v0.8+

## Release Notes

Here you can see the [history of what we've released](http://docs.traceview.solarwinds.com/Instrumentation/traceview-nodejs-history.html) and also the different frameworks and versions that we [support](http://docs.traceview.solarwinds.com/Instrumentation/nodejs.html).

## Installation

The `appoptics` module is [available on npm](http://npmjs.org/package/traceview) and can be installed by navigating to your app root and running:

```
npm install --save appoptics
```

Then, at the top of your main js file for your app, add this:

```
require('appoptics')
```

## Configuration

See our documentation on [configuring appoptics for node](http://docs.traceview.solarwinds.com/Instrumentation/nodejs.html#configuring-instrumentation).

## Upgrading

To upgrade an existing installation, navigate to your app root and run:

```
npm install --save appoptics@latest
```

## Adding Your Own Layers

In addition to the default layers captured automatically, you can optionally add your own. To learn on how to modify your code to report custom layers, [read here](http://docs.traceview.solarwinds.com/Instrumentation/nodejs.html#customizing-instrumentation).

## Testing

Tests are written using [mocha](http://npmjs.org/package/mocha), and can be
found in the `test` folder. Run them with:

```
npm test
```

#### Coverage reports

Test coverage reporting is also included. You can get a summary by running:

```
npm run coverage:report
```

Or, for a more in-depth view that shows reached areas of code, run:

```
npm run coverage:html
```

## Auto Documentation

Automatatic documentation is included via [yuidoc](http://yui.github.io/yuidoc/)
and can be generated and viewed with:

```
npm run docs
```

## Support

If you find a bug or would like to request an enhancement, feel free to file
an issue. For all other support requests, see our [support portal](https://tracelytics.freshdesk.com/).

## Contributing

You are obviously a person of great sense and intelligence. We happily
appreciate all contributions to the oboe module whether it is documentation,
a bug fix, new instrumentation for a library or framework or anything else
we haven't thought of.

We welcome you to send us PRs. We also humbly request that any new
instrumentation submissions have corresponding tests that accompany
them. This way we don't break any of your additions when we (and others)
make changes after the fact.

## Developer Resources

We have made a large effort to expose as much technical information
as possible to assist developers wishing to contribute to the appoptics module.
Below is a good source of information and help for developers:

* The [AppOptics Knowledge Base](http://docs.traceview.solarwinds.com/) has
a large collection of technical articles or, if needed, you can submit a
support request directly to the team.

If you have any questions or ideas, don't hesitate to contact us anytime.

## Layout of the module

The oboe module uses a standard layout.  Here are the notable directories.

```
lib/probes  # Auto loaded instrumentation
lib         # Layer and Event constructors
src         # Bindings to liboboe
test        # Mocha test suite
```

## Compiling the C extension

This module utilizes a C++ node extension to interface with the `liboboe.so`
library.  `liboboe` is installed as part of the `appoptics-bindings` package
which is a dependency of this package.  It is used to report host and
performance metrics to AppOptics servers.

If you would like to work with the C++ extension you should clone the github
`node-appoptics-bindings` repository and work with that. It's possible to
direct this package, `appoptics`, to use a non-standard source of `node-appoptics-bindings`
by setting the environment variable `AO\_TEST_PACKAGE`. See the file `install-appoptics-bindings.js` for further details.

## License

Copyright (c) 2016 SolarWinds, LLC

Released under the [Librato Open License](http://docs.traceview.solarwinds.com/Instrumentation/librato-open-license.html)
