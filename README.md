# AppOptics APM

The `appoptics-apm` module provides [AppOptics](https://www.appoptics.com/) instrumentation for Node.js.

It supports most commonly used databases, frameworks, and packages automatically. An
API allows anything to be instrumented.

An [AppOptics](https://www.appoptics.com/) account is required to view metrics.
Accounts are [free](https://www.appoptics.com/free-apm-software) for development
and testing use. For production usage a [free trial](https://www.appoptics.com/)
is a great way to start.

## Dependencies

- Linux
- Node.js v6+ [Maintenance and Active LTS](https://github.com/nodejs/Release)

The agent compiles a C++ addon during install, so you’ll need to have the following on the system prior to installing the agent:

- gcc version 4.7 and above
- for node-gyp: make and python 2.x (version 2.7 is [recommended](https://github.com/nodejs/node-gyp#on-unix))


## Installation

The `appoptics-apm` module is [available on npm](http://npmjs.org/package/appoptics-apm) and can be installed
by navigating to your app root and running:

```
npm install --save appoptics-apm
```

The agent requires a service key, obtained from the AppOptics dashboard under "Organization Details",
to connect to your account.  This is set via the `APPOPTICS_SERVICE_KEY` environment variable, make
sure it is available in the environment where your application is running:

```
export APPOPTICS_SERVICE_KEY="api-token-here:your-service-name"
```

Then, at the top of your main js file for your app, add this:

```
require('appoptics-apm')
```

Now restart your app and you should see data in your AppOptics dashboard in a minute or two.

## Important!

`appoptics-apm` should be the first file required. If, for example, you are using the `esm`
package to enable ES module syntax (import rather than require) and you use the following
command to invoke your program `node -r esm index.js` then `esm.js` is loaded first and
`appoptics-apm` is unable to instrument modules. You can use it, just make sure to require
`appoptics-apm` first, e.g., `node -r appoptics-apm -r esm index.js`.

If you are using the custom instrumentation SDK then appoptics must be loaded in the code
so that a reference to the SDK is obtained, like `const ao = require('appoptics-apm')`. It
is still be possible to use the command line `node -r appoptics-apm -r esm index.js`; the
require in the code will just get a reference to the results of the command line require.

## Configuration

See the [Configuration Guide](https://github.com/appoptics/appoptics-apm-node/blob/master/guides/configuration.md)

## Upgrading

To upgrade an existing installation, navigate to your app root and run:

```
npm install --save appoptics-apm@latest
```


## Support

If you find a bug or would like to request an enhancement, feel free to file
an issue. For all other support requests, please email support@appoptics.com.

## Contributing

You are obviously a person of great sense and intelligence. We welcome
contributions whether documentation, a bug fix, new instrumentation for
a framework or anything else.

We look forward to your PRs. Please provide tests for any new functionality
you submit. We don't want to break any of your additions when more changes
are made.

Get started with the [contribution guide](https://github.com/appoptics/appoptics-apm-node/blob/master/guides/contributing.md).

## License

Copyright (c) 2016, 2017, 2018 SolarWinds, LLC

Released under the [Librato Open License](https://docs.appoptics.com/kb/apm_tracing/librato-open-license/)
