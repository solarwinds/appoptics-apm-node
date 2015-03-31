module.exports = {
  //
  // Determines when to initiate traces for incoming requests. This can be set
  // at any time to change behaviour while the process is running.
  //
  // Available settings:
  // - through - When running behind another instrumented layer, like nginx
  // - always - When no instrumented outer layer is present
  // - never - When you don't want any tracing to occur
  //
  traceMode: 'through',

  //
  // Host and port of tracelyzer to report to.
  // Typically it is installed and running locally.
  //
  host: 'localhost',
  port: '7831',

  //
  // Module configs
  //
  // All instrumented modules have a few common settings:
  // - enabled - Turn instrumentation of that module on or off
  // - collectBacktraces - Toggle backtrace inclusion
  //
  // NOTE: Disabling backtraces may improve performance, but will make data
  // presented in the dashboard less useful for correlating code locations.
  //
  // SQL database modules also include a sanitizeSql setting to prevent
  // potentially sensitive data from being reported to AppNeta TraceView.
  //

  //
  // Core modules
  //

  'http-client': {
    enabled: true,
    collectBacktraces: true
  },

  'https-client': {
    enabled: true,
    collectBacktraces: true
  },

  //
  // Third party modules
  //

  // https://npmjs.org/package/redis
  redis: {
    enabled: true,
    collectBacktraces: true
  },

  // https://npmjs.org/package/mongodb
  mongodb: {
    enabled: true,
    collectBacktraces: true
  },

  // https://npmjs.org/package/mysql
  mysql: {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  },

  // https://npmjs.org/package/pg
  pg: {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  },

  // https://npmjs.org/package/node-cassandra-cql
  'node-cassandra-cql': {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  },

  // https://npmjs.org/package/cassandra-driver
  'cassandra-driver': {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  },

  // https://npmjs.org/package/memcached
  memcached: {
    enabled: true,
    collectBacktraces: true
  },

  // https://npmjs.org/package/levelup
  levelup: {
    enabled: true,
    collectBacktraces: true
  },

  // https://npmjs.org/package/hapi
  hapi: {
    enabled: true,
    collectBacktraces: true
  },

  // https://npmjs.org/package/restify
  restify: {
    enabled: true,
    collectBacktraces: true
  },

  // https://npmjs.org/package/tedious
  tedious: {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  },

  // https://npmjs.org/package/oracledb
  oracledb: {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  },

  // https://npmjs.org/package/raw-body
  'raw-body': {
    enabled: true,
    collectBacktraces: true
  },

  // https://npmjs.org/package/amqp
  amqp: {
    enabled: true,
    collectBacktraces: true
  }
}
