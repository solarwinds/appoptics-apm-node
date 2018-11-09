'use strict'

const packages = module.exports = []

//
// using a minimum version can avoid testing versions
// known to fail or deprecated, speeding the test.
//
//test('amqp', '>= 0.2.0')
test('amqplib', '>= 0.2.0 < 0.5.0 || > 0.5.0')

test('bcrypt', '>= 0.8.6')
test('bluebird', '>= 2.0.0')

test('cassandra-driver', '>= 3.3.0')
test('co-render')
test('director', '>= 1.2.0')
test('express', '>= 3.0.0')

test('generic-pool', '>= 2.4.0')

test2('hapi', {
  ranges: [
    {
      range: '>= 13.0.0 < 17.0.0',
      dependencies: ['vision@4'],
    }, {
      range: '>= 17.0.0',
      dependencies: ['vision@5'],
    }
  ]
})

test('koa', '>= 1.0.0')
test('koa-resource-router')
test('koa-route', '>= 1.0.1')
test('koa-router', '>= 3.0.0')

test('level', '>= 1.3.0')
test('memcached', '>= 2.2.0')

test('mongodb-core', '>= 2.0.0')

test('mongoose', '>= 3.8.26 < 4.2 || >= 4.2.2')

test('mysql', '>= 2.1.0')
test('oracledb', '>= 2.0.14')

test('pg', '>= 4.5.5')
test('q', '>= 0.9.0')
test('raw-body')
test('redis', '>= 0.8.0')
test('restify', '>= 2.0.0 < 2.0.2 || >= 2.0.3')
test('tedious', '>= 0.1.5')

test2('vision', {
  ranges: [
    {
      range: '>= 4.0.0 < 5.0.0',
      dependencies: ['hapi@16']
    }, {
      range: '>= 5.0.0',
      dependencies: ['hapi@17']
    }
  ]
})


//
// Helpers
//

function test (name, range, task) {
  packages.push({
    version: 1,
    name: name,
    task: task || './node_modules/gulp/bin/gulp.js test:probe:' + name,
    range: range || '*',
    timeout: 1000 * 60
  })
}

function test2 (name, options = {}) {
  const task = options.task || './node_modules/gulp/bin/gulp.js test:probe:' + name
  const timeout = options.timeout || 1000 * 60

  let ranges
  if (typeof options === 'string') {
    ranges = [{range: options}]
  } else if (!options.ranges) {
    ranges = [{range: '*'}]
  } else if (typeof options.ranges === 'string') {
    ranges = [{range: options.ranges}]
  } else if (Array.isArray(options.ranges)) {
    ranges = options.ranges
  } else {
    // eslint-disable-next-line max-len
    throw new Error(`Unexpected range ${options.range} for package ${name} in versions file ${__filename}`)
  }

  // consider checking whether ranges overlap or are out of order.
  /*
  for (let i = 0; i < ranges.length - 1; i++) {

  }
  // */

  packages.push({
    version: 2,
    name,
    task,
    ranges,
    timeout,
  })
}
