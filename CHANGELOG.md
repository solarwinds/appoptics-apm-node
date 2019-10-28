## appoptics-apm changelog

### v6.0.0

Features and bug fixes
- add per-url transaction filtering
- route handling code and middleware for express, koa, and restify are now traced.
- use APPOPTICS_LOG_SETTINGS to set log levels; using the DEBUG environment variable is deprecated.
    - `export APPOPTICS_LOG_SETTINGS=error,warn` as opposed to `export DEBUG=appoptics:error,appoptics:warn`
- issue explicit log warning if disabled by config.
- fix koa-router probe to work with multiple middleware arguments.
- fix incorrect oboe library version reporting in init message.

Breaking changes
- all breaking changes are in the API. See `guides/migration-5to6.md` for details.

#### v6.1.0

Features and bug fixes
- enable inserting trace IDs into logs automatically (pino, winston)
- new API function, `ao.getFormattedTraceId()` to get trace IDs using code.
- new API function, `ao.sendMetric()` for sending custom metrics.
- fix config file not found bug.

#### v6.2.0

Features
- enable inserting trace IDs into logs automatically (bunyan)
- `insertTraceIdsIntoLogs` options expanded to `false`, `true`, `'traced'`, `'sampledOnly'`, `'always'`

#### v6.3.0

Features and bug fixes
- add `insertTraceIdsIntoMorgan` to enable appending `ao.traceId=...` format morgan's text output.
- add `createTraceIdsToken`. Set to `'morgan'` to have the token `ao-auto-trace-id` token created. Use as `:ao-auto-trace-id` in morgan formats.
- set config to service key that was used.
- fix aws-sdk bad signature error on transaction retry.

#### v6.4.0

Features and bug fixes
- add support for SolarWinds Tokens (swoken)
- incorporate appoptics-bindings v6.2.1 with custom metrics fix

### v6.5.0

Features and bug fixes
- internal environment variable reorganization
- fix corrupted histogram in node 11.10.0+.
- support @hapi scoped packages hapi & vision.

### v6.5.1

Features and bug fixes
- use oboe v5.1.1, correcting histogram memory leak

### v6.6.0

Features and bug fixes
- context management simplification + bindings 6.4.0
- handle more boolean environment variable variations.
- propagate FilePath KV value correctly in edge case
- add log setting 'event:create', cassandra-driver now always uses 'patching'

### v6.7.0

Features and bug fixes
- trigger-trace
- appoptics-bindings 7.0.0
- loosen bind-emitter checks
- warn only when unknown environment variables

### v6.7.1

Bug fixes
- make TemplateLanguage KV consistent - never include leading dot.
- bind finalizer in instrumentHttp.
- fix zlib bind emitter message.

### v6.8.0

Features
- fetch container information in Azure App Service environment.

### v6.9.0

Features
- new `mongodb` probe for versions >= 3.3.0 as it now longer uses `mongodb-core`.
- allow the `fs` probe to ignore specific errors.
- `patching` log setting logs the version of patched modules.
- disable `mongodb-core` versions < 3 for node versions > 11.15.0 due to v8 memory leak.

Bug fixes
- supply a default `TransactionName` when none is present.
- log only one message for `getTraceSettings()` errors.
- log only one message for each incorrect KV pair.
- reset both count and time windows when a debounced log message is issued.
- add missing `FileDescriptor` to exit events.

