## Configuration ##

Configuration of `appoptics-apm` is possible through configuration files, environment variables, and run-time settings using the API. This covers configuration files and environment variables; the API is covered in the api guide.

### Required Configuration ###

There is only one configuration parameter that is required, the service key. The service key is in the form ``<api token>:<service name>``.

It must be supplied using either the environment variable APPOPTICS_SERVICE_KEY or via the `appoptics-apm` configuration file. If both are supplied the environment variable will be used. If not supplied the `appoptics-apm` agent will disable itself.

### The Configuration File ###

The `appoptics-apm` default configuration file is either `appoptics-apm.json` or `appoptics-apm.js`. It should be placed in the root directory of the project being instrumented. The file/location may be changed via the environment variable `APPOPTICS_APM_CONFIG_NODE`. When using `APPOPTICS_APM_CONFIG_NODE` the path it specifies must include the filename. If the file is a node module it must export a single object containing the same information has `appoptics-apm.json` would; the advantage of using a node module is that the values for configuration properties can be set programmatically.

The configuration file can supply the following properties, showing their defaults:

```
{
  serviceKey: undefined,
  enabled: true,
  hostnameAlias: undefined,
  domainPrefix: false,
  ignoreConflicts: false,
  traceMode: 'enabled',
  transactionSettings: undefined,
  insertTraceIdsIntoLogs: false,
  insertTraceIdsIntoMorgan: false,
  createTraceIdsToken: undefined,
  probes: {
    // probe-specific defaults. see dist/defaults.js for details
  }
}
```

#### Top Level Configuration File Properties ####

| Property Name        | Default  | Description |
| -------------------- | -------- | ----------- |
|serviceKey||As described above.|
|enabled|`true`|If set to false the `appoptics-apm` agent will disable itself.|
|hostnameAlias||A logical hostname that can be used to easily identify the host.|
|domainPrefix|`false`|Prefix transaction names with the domain name.|
|ignoreConflicts|`false`|Appoptics will disable itself when conflicting APM products are loaded unless this is set to `true`.|
|traceMode|`'enabled'`|Mode `'enabled'` will cause Appoptics to sample as many requests as possible. Mode 'disabled' will disable sampling and metrics.|
|transactionSettings|`undefined`|An array of transactions to exclude. Each array element is an object of the form `{type: 'url', string: 'pattern', tracing: trace-setting}` or `{type: 'url', regex: /regex/, tracing: trace-setting}`. When the specified type (currently only `'url'` is implemented) matches the string or regex then tracing for that url is set to trace-setting, overriding the global traceMode. N.B., it is not possible to specify a regex in a JSON configuration file. If you wish to specify a regex then the configuration file must be a module that returns the configuration object.|
|ec2MetadataTimeout|`1000`|Milliseconds to wait for the ec2/openstack metadata service to respond|
|insertTraceIdsIntoLogs|`false`|Insert trace IDs into supported logging packages' output. Options are `true`, `'traced'`, `'sampledOnly'`, and `'always'`. The default, `false`, does not insert trace ids. `true` and `'traced'` insert the ID when AppOptics is tracing. `'sampledOnly'` inserts the ID when the trace is sampled. `'always'` inserts an empty trace ID value (all-zeroes) even when not tracing.|
|insertTraceIdsIntoMorgan|`false`|Append trace IDs to morgan log lines. Because morgan does not output JSON the morgan formats must be modified to enable the trace IDs to be appended. This is a more invasive approach than inserting a property in a JSON object so it requires this explicit setting. The options are the same as for `insertTraceIdsIntoLogs`.|
|createTraceIdsToken|`undefined`|Create a token that can be used in a logging package's format string. If set to `'morgan'` the token `ao-auto-trace-id` will be created and `:ao-auto-trace-id` can be used in morgan format strings.|
|triggerTraceEnabled|`true`|Enable or disable the trigger-trace feature. Option values are `true` and `false`|


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

Bonus - the configuration file is `require`d so it can be a module as opposed to pure JSON (double quoting properties, no comments):

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

#### Environment Variables ####

These environment variables may be set:

| Variable Name        | Default  | Description |
| -------------------- | -------- | ----------- |
|APPOPTICS_LOG_SETTINGS|`'error,warn'`|Categories to log. If set this takes precedence over the DEBUG environment variable (deprecated).|
|APPOPTICS_APM_CONFIG_NODE|`'$PWD/appoptics-apm'`|The location of the configuration file.|
|APPOPTICS_REPORTER|`'ssl'`|The reporter that will be used throughout the runtime of the app. Possible values: ssl, udp, file. This is typically used only for testing.|
|APPOPTICS_COLLECTOR|`'collector.appoptics.com:443'`|SSL collector endpoint address and port (only used if APPOPTICS_REPORTER = ssl). This is typically changed only for testing.|
|APPOPTICS_TRUSTEDPATH|built-in|Path to the certificate used to verify the collector endpoint. Used only for testing.|
|APPOPTICS_DEBUG_LEVEL|`'2'`|Logging level for low-level library. Higher numbers get more logging. Possible values: 1 to 6|
|APPOPTICS_TRIGGER_TRACE|`'enable'`|Enable or disable the trigger-trace feature. Options are `'enable'`, `'disable'`|
|DEBUG|`'appoptics:error,appoptics:warn'`|Deprecated. While the node agent uses the [`debug`](https://www.npmjs.com/package/debug) package for logging, it is more convenient to use APPOPTICS_LOG_SETTINGS so the 'appoptics:' prefix does not need to be entered for each category.|

Appoptics-specific `debug` loggers are made available via `ao.loggers` without requiring the `appoptics:` prefix. Typical usage is

```
// no need to set up standard error loggers (error, warn)
const log = ao.loggers
log.error('bad error')
```
