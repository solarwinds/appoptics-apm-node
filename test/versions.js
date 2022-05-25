'use strict'

//
// this file defines the versions that will be tested when using
// testeachversion.
//
// it helps speed up the test matrix run if combinations known to fail
// are excluded from the tests. 'bcrypt' and 'pg' show two ways to limit
// tests.
//

const { VersionSpec } = require('testeachversion')
const semver = require('semver')
const linuxOsInfo = require('linux-os-info')

const loi = linuxOsInfo({ mode: 'sync' })

const packages = module.exports = []

// node builtin modules
test('crypto')
test('fs')
test('http')
test('https')
test('zlib')

//
// using a minimum version can avoid testing versions
// known to fail or deprecated, speeding the test.
//
// test('amqp', '>= 0.2.0')
test('amqplib', '>= 0.2.0 < 0.5.0 || > 0.5.0')

test('bcrypt', selectone(process.version, [
  // version 4.0.0 doesn't work on alpine
  { selector: '>= 12.0.0', targetSelector: loi.id !== 'alpine' ? '>= 3.0.6' : '>= 3.0.6 < 4.0.0 || >= 4.0.1' }
]))

test('bluebird', '>= 2.0.0')
test('bunyan', '>= 1.0.0')

test('cassandra-driver', '>= 3.3.0')
test('co-render')
test('director', '>= 1.2.0')
test('express', '>= 3.0.0')

test('generic-pool', '>= 2.4.0')

if (node('gte', '11.0.0')) {
  test('@hapi/hapi', {
    ranges: [
      {
        range: '*',
        dependencies: ['vision@5']
      }
    ]
  })
  test('@hapi/vision', {
    ranges: [
      {
        range: '*',
        dependencies: ['hapi@18']
      }
    ]
  })
}

// koa has so many parts and pieces this can get complicated
test('koa', {
  ranges: [
    {
      range: '>= 1.0.0 < 2.0.0',
      dependencies: ['koa-router@5']
    }, {
      range: '>= 2.0.0',
      dependencies: ['koa-router@7']
    }
  ]
})
test('koa-resource-router')
test('koa-route', '>= 1.0.1')
test('koa-router', {
  ranges: [
    {
      range: '>= 3.0.0 < 6.0.0',
      dependencies: ['koa@1']
    }, {
      range: '>= 6.0.0',
      dependencies: ['koa@2']
    }
  ]
})

test('level', node('gte', '12.0.0') ? '>= 5.0.0' : '>= 1.3.0')
test('log4js')

test('memcached', '>= 2.2.0')
// prior to version 3.3.0 mongodb used mongodb-core.
test('mongodb', '>= 3.3.0')
test('mongodb-core', '>= 2.0.0')
// our agent disables mongodb-core versions less than 3 on node > 11.15.0 due to memory leak.
// mongoose 5 is the first that uses mongodb-core 3.
test('mongoose', node('gte', '11.15.0') ? '>= 5.0.0' : '>= 4.6.4')
test('morgan', '>= 1.6.0')
test('mysql', '>= 2.1.0')

test('oracledb', '>= 2.0.14')

test('pino', '>= 2.3.0')
test('pg', node('gte', '14.0.0') ? '>= 8.0.3' : '>= 4.5.5 < 7.0.0 || >= 7.5.0')
/*
test('pg', {
  ranges: [
    {
      range: '>= 4.5.5 < 7.0.0',
      dependencies: ['pg-native@1.7']
    }, {
      range: '>= 7.0.0',
      dependencies: ['pg-native@2']
    }
  ]
})
// */

test('q', '>= 0.9.0')

test('raw-body')
test('redis', '>= 0.8.0')

if (node('lt', '18.0.0')) {
  test('restify', '>= 4.1.0')
}

test('tedious', '>= 0.1.5')

test('winston', '>= 1.0.0')

//
// Helpers
//

function test (name, ranges) {
  const options = {}
  if (typeof ranges === 'string') {
    options.ranges = ranges
  } else if (typeof ranges === 'object') {
    options.ranges = ranges.ranges
  }
  if (name[0] === '@') {
    options.task = `mocha --exit test/probes/${name.replace('/', '-')}.test.js`
  } else {
    options.task = `mocha --exit test/probes/${name}.test.js`
  }
  packages.push(new VersionSpec(name, options))
}

function node (op, version) {
  return semver[op](process.version, version)
}

//
// selectone(process.version, [
//   {selector: '> 9.0.0 < 13.0.0', targetSelector: '> 1.0.3'}
// ])
//
function selectone (version, ranges) {
  for (let i = 0; i < ranges.length; i++) {
    if (semver.satisfies(version, ranges[i].selector)) {
      return ranges[i].targetSelector
    }
  }
  // if nothing matches choose the last one
  return ranges[ranges.length - 1].targetSelector
}
