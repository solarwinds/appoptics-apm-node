## Configuration ##

Configuration of `appoptics-apm` is possible through configuration files, environment variables, and run-time settings using the API. This covers configuration files and environment variables; the API is covered in the api guide.

### Required Configuration ###

There is only one configuration parameter that is required, the service key. The service key is in the form ``<api token>:<service name>``.

It must be supplied using either the environment variable APPOPTICS_SERVICE_KEY or via the `appoptics-apm` configuration file. If both are supplied the environment variable will be used. If not supplied the `appoptics-apm` agent will disable itself.

### The Configuration File ###

The `appoptics-apm` configuration file is `appoptics-apm.json` and should be placed in the root directory of the project being instrumented. The file/location may be changed via the environment variable `APPOPTICS_APM_CONFIG_NODE`. If changing the location `APPOPTICS_APM_CONFIG_NODE` must include the filename, not just the path.

The configuration file supplies the following properties, showing their defaults:

```
{
  enabled: true,
  serviceKey: undefined,
  hostnameAlias: undefined,
  domainPrefix: false,
  traceMode: undefined,
  sampleRate: undefined,
  ignoreConflicts: false,
  probes: {
    // probe-specific defaults. see dist/defaults.js for details
  }
}
```

#### Top Level Configuration File Properties ####

| Property Name        | Default  | Description |
| -------------------- | -------- | ----------- |
|serviceKey||As described above.|
|enabled|true|If set to false the `appoptics-apm` agent will disable itself.|
|hostnameAlias||A logical hostname that can be used to easily identify the host.|
|domainPrefix|false|Prefix transaction names with the domain name.|
|ignoreConflicts|false|Appoptics will not ignore conflicting APM products are loaded and will disable itself unless this is set to `true`.|

#### Configuration File Probe Settings ####

Probes are the packages that `appoptics-apm` auto-instruments. Different types of probes have different configuration options. See `dist/defaults.js` (or `lib/defaults.js` if you've cloned the github repository) for details.

Probe settings in the `appoptics-apm` configuration file will override those in `defaults.js`, so the best approach to changing an option is to add it to `appoptics-apm.json`. For example, here is how to turn off sampling for `fs`:

```
{
  "enabled": true,
  "serviceKey": "...",
  "probes": {
    "fs": {
      "enabled": false
    }
  }
}
```

Bonus - the configuration file is `require`d so it needn't be pure JSON syntax (double quoting properties, no comments):

```
module.exports = {
  enabled: true,
  serviceKey: "...",
  // isn't this much better?
  probes: {
    fs: {
      enabled: false
    }
  }
}
```

### Debugging Configuration ###

This section is primarily of interest to those implementing custom instrumentation or doing development on the `appoptics-apm` agent and SDK.

#### Configuration File ####

These configuration file properties may be set:

| Property Name        | Default  | Description |
| -------------------- | -------- | ----------- |
|traceMode|auto|Mode 'always' will cause Appoptics to sample as many requests as possible. Mode 'never' will disable sampling (metrics will still be collected).|
|sampleRate|auto|Numerator for denominator of 1,000,000 to set the fraction of requests that Appoptics will attempt to sample.|

#### Environment Variables ####

These environment variables may be set:

| Variable Name        | Default  | Description |
| -------------------- | -------- | ----------- |
|APPOPTICS_DEBUG_LEVEL|2|Logging level to adjust the logging verbosity. Increase the logging verbosity to one of the debug levels to get more detailed information. Possible values: 1 to 6|
|APPOPTICS_REPORTER|ssl|The reporter that will be used throughout the runtime of the app. Possible values: ssl, udp, file. This is typically used only for testing.|
|APPOPTICS_COLLECTOR|collector.appoptics.com:443|SSL collector endpoint address and port (only used if APPOPTICS_REPORTER = ssl). This is typically changed only for testing.|
|APPOPTICS_COLLECTOR_UDP|127.0.0.1:7832|UDP collector endpoint address and port (ignored unless APPOPTICS_REPORTER = udp).|
|APPOPTICS_TRUSTEDPATH|built-in|Path to the certificate used to verify the collector endpoint. Used only for testing.|
|DEBUG|appoptics:error,appoptics:warn|The node agent uses the [`debug`](https://www.npmjs.com/package/debug) package for logging.|

Appoptics-specific `debug` loggers are made available via `ao.loggers` without requiring the `appoptics:` prefix. Typical usage is

```
// shorthand for setting up `require('debug')('appoptics:error')`
const log = ao.loggers
log.error('bad error')
```
