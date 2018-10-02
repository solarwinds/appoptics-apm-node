'use strict'

module.exports = {
  //
  // Module configs
  //
  // All instrumented modules have a few common settings:
  // - enabled - Set instrumentation of that module true or false
  // - collectBacktraces - Set backtrace inclusion true or false
  //
  // NOTE: Disabling backtraces may improve performance, but will make data
  // presented in the dashboard less useful for correlating code locations.
  //
  // SQL database modules also include a sanitizeSql setting to prevent
  // potentially sensitive data from being reported to AppOptics.
  //

  //
  // Probes
  //

  probes: {
    crypto: {
      enabled: true,
      collectBacktraces: true
    },

    fs: {
      enabled: true,
      collectBacktraces: true
    },

    http: {
      includeRemoteUrlParams: true
    },

    https: {
      includeRemoteUrlParams: true
    },

    'http-client': {
      enabled: true,
      collectBacktraces: true,
      includeRemoteUrlParams: true
    },

    'https-client': {
      enabled: true,
      collectBacktraces: true,
      includeRemoteUrlParams: true
    },

    zlib: {
      enabled: true,
      collectBacktraces: true
    },

    //
    // Third party modules
    //


    // https://npmjs.org/package/amqp
    amqp: {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/amqplib
    amqplib: {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/cassandra-driver
    'cassandra-driver': {
      enabled: true,
      collectBacktraces: true,
      sanitizeSql: true
    },

    // https://npmjs.org/package/co-render
    'co-render': {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/director
    director: {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/express
    express: {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/hapi
    hapi: {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/koa
    koa: {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/koa-resource-router
    'koa-resource-router': {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/koa-route
    'koa-route': {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/koa-router
    'koa-router': {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/levelup
    levelup: {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/memcached
    memcached: {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/mongodb
    mongodb: {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/mongodb-core
    'mongodb-core': {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/mysql
    mysql: {
      enabled: true,
      collectBacktraces: true,
      sanitizeSql: true
    },

    // https://npmjs.org/package/node-cassandra-cql
    'node-cassandra-cql': {
      enabled: true,
      collectBacktraces: true,
      sanitizeSql: true
    },

    // https://npmjs.org/package/oracledb
    oracledb: {
      enabled: true,
      collectBacktraces: true,
      sanitizeSql: true
    },

    // https://npmjs.org/package/pg
    pg: {
      enabled: true,
      collectBacktraces: true,
      sanitizeSql: true
    },

    // https://npmjs.org/package/raw-body
    'raw-body': {
      enabled: true,
      collectBacktraces: true
    },

    // https://npmjs.org/package/redis
    redis: {
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
      sanitizeSql: true
    },

    // https://npmjs.org/package/vision
    vision: {
      enabled: true,
      collectBacktraces: true,
    }
  }
}
