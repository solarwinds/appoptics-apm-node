'use strict'

const nvm_dir = process.env.NVM_DIR
const version = process.version
const prefix = process.env.NODE_PATH ? ':' : ''
const globalInstalls = `${prefix}${nvm_dir}/versions/node/${version}/lib/node_modules`
process.env.NODE_PATH += globalInstalls

const ao = require('../..')
const expect = require('chai').expect

const soon = global.setImmediate || process.nextTick

// eslint-disable-next-line no-unused-vars
function psoon () {
  return new Promise((resolve, reject) => {
    soon(resolve)
  })
}

describe('verify lambda function wrapper works', function () {
  it('should wrap a function', function () {
    async function someHandler (event, context) {
      return Promise.resolve('i am done')
    }

    expect(someHandler).not.property(ao.wrappedFlag)
    const wrapped = ao.wrapLambdaHandler(someHandler)

    expect(someHandler).property(ao.wrappedFlag, wrapped)
  })

  it('should be wrapped as expected', function () {
    async function someHandler (event, context) {
      return Promise.resolve('i am done')
    }

    const wrapped = ao.wrapLambdaHandler(someHandler)

    expect(wrapped).a('function')
    expect(wrapped).property('constructor')
    expect(wrapped.constructor.name).equal('AsyncFunction')
  })

  it('should not wrap a function twice', function () {
    async function someHandler (event, context) {
      return Promise.resolve('i am done')
    }

    const wrapped = ao.wrapLambdaHandler(someHandler)
    const rewrapped = ao.wrapLambdaHandler(someHandler)

    expect(wrapped).equal(rewrapped)
  })
})
