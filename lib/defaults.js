module.exports = {
  redis: {
    enabled: true,
    collectBacktraces: true
  },
  mongodb: {
    enabled: true,
    collectBacktraces: true
  },
  'http-client': {
    enabled: true,
    collectBacktraces: true
  },
  'https-client': {
    enabled: true,
    collectBacktraces: true
  },
  mysql: {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  },
  pg: {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  },
  'node-cassandra-cql': {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  },
  'cassandra-driver': {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  },
  memcached: {
    enabled: true,
    collectBacktraces: true
  },
  levelup: {
    enabled: true,
    collectBacktraces: true,
    enableBatchTracing: false
  },
  hapi: {
    enabled: true,
    collectBacktraces: true
  },
  restify: {
    enabled: true,
    collectBacktraces: true
  },
  tedious: {
    enabled: true,
    collectBacktraces: true,
    sanitizeSql: false
  }
}
