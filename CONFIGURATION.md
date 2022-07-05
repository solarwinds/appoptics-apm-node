## Configuration ##

Configuration of `appoptics-apm` is possible through configuration files, environment variables, and run-time
settings using the API. This covers configuration files and environment variables; the API is covered in the
api guide.

## Required Configuration ##

There is only one configuration parameter that is required, the service key. The service key is in the form
``<api token>:<service name>``.

It must be supplied using either the environment variable APPOPTICS_SERVICE_KEY or via the
`appoptics-apm-config` configuration file. If both are supplied the environment variable will be used.
If not supplied the `appoptics-apm` agent will disable itself.

## The Configuration File ##

The `appoptics-apm` default configuration file is either `appoptics-apm-config.json` or `appoptics-apm-config.js`.
It should be placed in the root directory of the project being instrumented. The file/location may be changed via the
environment variable `APPOPTICS_APM_CONFIG_NODE`. When using `APPOPTICS_APM_CONFIG_NODE` the path it specifies must
include the filename. If the file is a node module it must export a single object containing the same information that
`appoptics-apm-config.json` would; the advantage of using a node module is that the values for configuration properties
can be set programmatically.

The configuration file can supply the following properties, showing their defaults:

```
{
  serviceKey: undefined,
  enabled: true,
  hostnameAlias: undefined,
  domainPrefix: false,
  traceMode: 'enabled',
  runtimeMetrics: true,
  transactionSettings: undefined,
  insertTraceIdsIntoLogs: false,
  proxy: undefined,
  probes: {
    // probe-specific defaults. see: /docs/probe-defaults.md for details
  }
}
```

### Top Level Configuration File Properties ###

| Property Name        | Default  | Description |
| -------------------- | -------- | ----------- |
|serviceKey||As described above.|
|enabled|`true`|If set to false the `appoptics-apm` agent will disable itself.|
|proxy||Proxy that does not require authentication: `http://proxy-server:3306`. Proxy that does require Basic Authentication: `http://user:password@proxy-server:3306`.|
|hostnameAlias||A logical hostname that can be used to easily identify the host.|
|domainPrefix|`false`|Prefix transaction names with the domain name.|
|traceMode|`'enabled'`|Mode `'enabled'` will cause Appoptics to sample as many requests as possible. Mode 'disabled' will disable sampling and metrics.|
|runtimeMetrics|`true`|Collect runtime metrics characterizing the performance of node and v8|
|transactionSettings|`undefined`|An array of transactions to exclude. Each array element is an object of the form `{type: 'url', string: 'pattern', tracing: trace-setting}` or `{type: 'url', regex: /regex/, tracing: trace-setting}`. When the specified type (currently only `'url'` is implemented) matches the string or regex then tracing for that url is set to trace-setting, overriding the global traceMode. N.B. if inserting a regex into a JSON configuration file you must enter the string that is expected by the `RegExp` constructor because JSON has no representation of a `RegExp` object. `trace-setting` is either `'enabled'` or `'disabled'`.|
|ec2MetadataTimeout|`1000`|Milliseconds to wait for the ec2/openstack metadata service to respond|
|insertTraceIdsIntoLogs|`false`|Insert trace IDs into supported logging packages' output. Options are `true`, `'traced'`, `'sampledOnly'`, and `'always'`. The default, `false`, does not insert trace ids. `true` and `'traced'` insert the ID when AppOptics is tracing. `'sampledOnly'` inserts the ID when the trace is sampled. `'always'` inserts an empty trace ID value (all-zeroes) even when not tracing.|
|triggerTraceEnabled|`true`|Enable or disable the trigger-trace feature. Option values are `true` and `false`|


### Configuration File Probe Settings ###

Probes are the packages that `appoptics-apm` auto-instruments. Different types of probes have different
configuration options. See [probe defaults](./docs/probe-defaults.md) for details.

There is one particular setting for the `fs` probe that you might want to be aware of: `ignoreErrors`.
The only errors that can be ignored are node System errors (see the node [docs](https://nodejs.org/api/errors.html#errors_common_system_errors))
provided by the asynchronous functions or thrown by the synchronous functions. Note that there is only one setting for
each pair of asynchronous and synchronous functions, e.g. the `open` setting applies to both `fs.open()` and
`fs.openSync()`.

Ignoring the `ENOENT` error for the `fs.open()` and `fs.openSync()` functions is shown in the examples below. This setting
won't take effect because of the `fs` probe setting `enabled: false` but is shown for the syntax.

Probe settings in the `appoptics-apm-config` configuration file will override [probe defaults](./docs/probe-defaults.md). For example, here is how to turn off sampling for `fs`:

```
{
  "enabled": true,
  "serviceKey": "...",
  "probes": {
    "fs": {
      "enabled": false,
      "ignoreErrors": {
        "open": {
          "ENOENT": true
        }
      }
    }
  }
}
```

Bonus - the configuration file is `require`d so it can be a module (instead of JSON). A module allows
using native JavaScript with comments and avoids the need to double quote all the property names.

```
module.exports = {
  enabled: true,
  serviceKey: "...",
  // isn't this much better?
  probes: {
    fs: {
      enabled: false,
      ignoreErrors: {
        open: {
          ENOENT: true,
        }
      }
    }
  }
}
```

#### Environment Variables ####

Environment variables with illegal values will generate a warning message and revert to their default values.
Variables accepting `'true'` and `'false'` as options care case-insensitive.

These environment variables may be set:

| Variable Name        | Default  | Description |
| -------------------- | -------- | ----------- |
|APPOPTICS_ENABLED|`true`|The agent is enabled. Set to `false` to disable.|
|APPOPTICS_LOG_SETTINGS|`'error,warn'`|Categories to log. If set this takes precedence over the deprecated DEBUG environment variable. If set to empty it suppresses all agent log messages.|
|APPOPTICS_PROXY||Proxy that does not require authentication: `http://proxy-server:3306`. Proxy that does require Basic Authentication: `http://user:password@proxy-server:3306`.|
|APPOPTICS_APM_CONFIG_NODE|`'$PWD/appoptics-apm'`|The location of the configuration file.|
|APPOPTICS_DEBUG_LEVEL|`'2'`|Logging level for low-level library. Higher numbers get more logging. Possible values: 1 to 6|
|APPOPTICS_TRIGGER_TRACE_ENABLED|`'true'`|Enable the trigger-trace feature. Options are `'true'`, `'false'`|
|APPOPTICS_RUNTIME_METRICS|`'true'`|Enable runtime metrics. Options are `'true'`, `'false'`|
|APPOPTICS_REPORTER|`'ssl'`|The reporter that will be used throughout the runtime of the app. Possible values: `'ssl'`, `'udp'`. This is used for testing.|
|APPOPTICS_COLLECTOR|`'collector.appoptics.com:443'`|SSL collector endpoint address and port. This is typically changed only for testing.|
|APPOPTICS_TRUSTEDPATH|built-in|Path to the certificate used to verify the collector endpoint. Used only for testing.|
