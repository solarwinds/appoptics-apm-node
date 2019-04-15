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

