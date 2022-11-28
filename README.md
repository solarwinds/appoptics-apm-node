# AppOptics APM

The `appoptics-apm` module provides [AppOptics](https://www.appoptics.com/) instrumentation for Node.js.

It supports most commonly used databases, frameworks, and packages automatically. An
API (a.k.a Custom SDK) allows anything to be instrumented. An [AppOptics](https://www.appoptics.com) account is required to view traces & metrics.


## Dependencies

This is a **Linux Only package** with no Mac or Windows support. When installed on Mac or Windows (for development) it will degrade gracefully.

It is compatible with Node versions 14, 16 and 18. See [node status](https://github.com/nodejs/Release) for more.

It is dependent on [solarwinds-apm-bindings](https://github.com/solarwindscloud/solarwinds-bindings-node) binary add-on. 

### Binary dependency

The SolarWinds APM Agent will first attempt to install a prebuilt binary add-on using [node-pre-gyp](https://github.com/mapbox/node-pre-gyp). Prebuilt binaries are provided for various versions of Alpine, Centos, Amazon Linux and Red Hat Enterprise Linux.

Only if finding an appropriate prebuilt binary fails, will the agent attempt to build the binary add-on from source using [node-gyp](https://github.com/nodejs/node-gyp#on-unix). In such a case, the target platform should include the build toolchain.

Building with node-gyp (via node-pre-gyp) requires:

- Python (2 or 3 depending on version of npm)
- make
- A proper C/C++ compiler toolchain, like GCC

## Installing

The `appoptics-apm` module is [available on npm](http://npmjs.org/package/appoptics-apm) and can be installed
by navigating to your app root and running:

```
npm install --save appoptics-apm
```

## Authorizing


The agent requires a service key, obtained from the AppOptics dashboard. This is set via the `APPOPTICS_SERVICE_KEY` environment variable, make
sure it is available in the environment where your application is running:

```
export APPOPTICS_SERVICE_KEY="api-token-here:your-service-name"
```

A service key is composed of an API token and the name of the service you're installing on. The AppOptics platform onboarding flow provides the full service key.

## Loading

To load the agent into your application you can use one of two methods: require `appoptics-apm` in your application start command (run time), or require `appoptics-apm` in your entry point file before any other `require()` calls (build time).

Below are simple examples:

**At Start (preferred)**
```bash
node -r appoptics-apm <app.js>
```

**In Code**
```js
// must be first require
require('appoptics-apm')

const express = require('express')
const app = express()
app.get('/', (req, res) => res.send('Hello World!'))
app.listen(3000, () => console.log('Example app listening on port 3000!'))
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

See the [Configuration Guide](https://github.com/appoptics/appoptics-apm-node/blob/master/CONFIGURATION.md)

## Upgrading

To upgrade an existing installation, navigate to your app root and run:

```
npm install --save appoptics-apm@latest
```


## Support

If you find a bug or would like to request an enhancement, feel free to file
an issue. For all other support requests, please email technicalsupport@solarwinds.com.


## License

Copyright (c) 2016 - 2022 SolarWinds, LLC

Released under the [Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0)
