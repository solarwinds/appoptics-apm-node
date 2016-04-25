# TraceView

The `traceview` module provides AppNeta [TraceView](http://www.appneta.com/application-performance-management/) instrumentation for Node.JS.

It has the ability to report performance metrics on an array of libraries,
databases and frameworks.

It requires a [TraceView](http://www.appneta.com/products/traceview/) account to
view metrics.  Get yours; [it's free](http://www.appneta.com/products/traceview/signup/index.html?Ref__c=20446).

## Dependencies

- Linux
- node.js v0.8+
- liboboe installed at standard lib path
    - (installed as part of TraceView signup; node-traceview is a noop without it)

## Release Notes

Here you can see the [history of what we've released](https://support.appneta.com/cloud/nodejs-instrumentation-release-notes) and also the different frameworks and versions that we support.

## Installation

The `traceview` module is [available on npm](http://npmjs.org/package/traceview) and can be installed by navigating to your app root and running:

```
npm install --save traceview
```

Then, at the top of your main js file for your app, add this:

```
require('traceview')
```

## Configuration

See our documentation on [configuring traceview for node](https://support.appneta.com/cloud/configuring-nodejs-instrumentation).

## Upgrading

To upgrade an existing installation, navigate to your app root and run:

```
npm install --save traceview@latest
```

## Adding Your Own Layers

In addition to the default layers captured automatically, you can optionally add your own. To learn on how to modify your code to report custom layers, [read here](https://docs.appneta.com/custom-nodejs-instrumentation).

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
an issue. For all other support requests, see our support portal or on
IRC @ #appneta on Freenode.

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

We at AppNeta have made a large effort to expose as much technical information
as possible to assist developers wishing to contribute to the traceview module.
Below are the three major sources for information and help for developers:

* The [TraceView blog](http://www.appneta.com/blog) has a constant stream of
great technical articles.  (See [A Gentle X-Trace Introduction](http://www.appneta.com/blog/x-trace-introduction/)
for details on the basic methodology that TraceView uses to gather structured
performance data across hosts and stacks.)

* The [TraceView Knowledge Base](https://support.appneta.com/cloud/traceview)
has a large collection of technical articles or, if needed, you can submit a
support request directly to the team.

* You can also reach the TraceView team on our IRC channel #appneta on freenode.

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

This module utilizes a C++ extension to interface with the system `liboboe.so`
library.  This system library is installed with the TraceView host packages
(tracelyzer, liboboe0, liboboe-dev) and is used to report
[host](http://www.appneta.com/blog/app-host-metrics/) and performance metrics
from multiple sources (nodejs, nginx, python etc.) back to TraceView servers.

Note: Make sure you have the development package `liboboe0-dev` installed
before attempting to compile the C extension.

```bash
>$ dpkg -l | grep liboboe
ii  liboboe-dev    1.1.1-precise1    Tracelytics common library -- development files
ii  liboboe0       1.1.1-precise1    Tracelytics common library
```

See [Installing Base Packages on Debian and Ubuntu](https://support.appneta.com/cloud/installing-traceview)
in the Knowledge Base for details.  Our hacker extraordinaire
[Rob Salmond](https://github.com/rsalmond) from the support team has even
gotten these packages to [run on Gentoo](http://www.appneta.com/blog/unsupported-doesnt-work/)!

To see the code related to the C++ extension, take a look in `src`.

## License

Copyright (c) 2014 Appneta

Released under the [AppNeta Open License](http://www.appneta.com/appneta-license), Version 1.0
