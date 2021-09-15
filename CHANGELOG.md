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

### v7.0.0

Features
- add forceNewTrace option to `startOrContinueTrace()`
- support brotli compressin in `zlib`
- support restify v7+
- use `ace-context`; remove `continuation-local-storage`

Bug fixes
- force new context on inbound HTTP requests.
- fix http `RemoteURL` KV when search/query is present
- exit http/s client spans correctly on socket errors
- exit http/s client spans on upgrade events
- don't add undefined `Database` KV
- use new http_parser values if present

### v7.1.0

Features
- runtime metrics
- new function `sendMetrics()`; deprecate `sendMetric()`
- requires `appoptics-bindings@9`

### v7.1.1

Bug fix
- fix undefined `reporter` in `sendMetrics()`

### v8.0.0

Features
- minimize span/event creation for unsampled traces
- support HTTP proxy configuration
- improve run span logic.
- debounce metrics send error logging
- improve logging consistency
- implement messaging for host-requested soft disable

Breaking changes
- removed `Span.last` and `Event.last` - use `ao.lastSpan` and `ao.lastEvent`
- removed `span.exitWithError()` - use `span.exitCheckingError()`
- `aob.Reporter.isReadyToSample()` is now `aob.isReadyToSample()`
- `aob.Metadata` no longer exists. see `guides/migration.md` if you're using this low level class.
- removed `%m` custom log format for `Metadata` objects.

### v8.0.1

Bug fixes
- support cassandra-driver > v4.4.0
- document proxy in configuration guide.

### v8.1.0

Features
- http/https probe configuration property to specify header to be used for ClientIP KV
- don't read instrumented package versions more than once.

Bug fix
- don't log an error when `req.socket.remoteAddress` is undefined.

### v9.0.0

Features
- lambda support
- capture agent version in init message

Breaking change
- removed `ao.serviceKey` property.

Bug fix
- change config file name `appoptics-apm.{js|json}` => `appoptics-apm-config.{js|json}`

### v10.0.0

Features
- `@appoptics/apm-bindings` replaces `appoptics-bindings`. `@appoptics/apm-bindings` uses `node-pre-gyp` so that users of LTS versions of node do not need to have the c/c++ build chain installed.
- if `APPOPTICS_LOG_SETTINGS` is empty suppress all logging
- use shimmer instead of ximmer
- add `span.runPromise()` - native async span runner
- updated to Apache 2.0 license

Breaking change
- Removed `ao.serviceKey`
- Configuration file name-change

Bug fix
- pass options to koa constructor
- check if module needs patching before doing builtin lookup
- set txname when not set by frameworks

### v10.0.1

Bug fix
- avoid triggering non-existent property warning during module.exports on Node 14
