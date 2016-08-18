# Instrumenting a module

Let's say you want to instrument module `abc` to report timing information
for function `xyz`. First of all, you need a patch file to apply to the
module. This patch file should go in `lib/probes` as `lib/probes/abc.js`
and should export a single function as module.exports, which accepts the
unmodified module as the first input argument and returns the modified
module.

```js
module.exports = function (abc) {
  return abc
}
```

## Wrapping functions

To collect the performance data of a given function, we'll need to wrap it
in another, which collects are reports the relevant data. You can simply
store the old function reference in a new variable, overwrite the function
at the original location, and call the stored function within the new one.
However, there are handy tools to make this process easier. We use shimmer.

### Sync wrapping

To wrap a sync function, you simply need to place some code before and after
the call of the stored function.

```js
shimmer.wrap(abc, 'xyz', xyz => {
  return function () {
    const before = Date.now()
    const returnValue = xyz.apply(this, arguments)
    const after = Date.now()
    console.log(`xyz took ${after - before}ms`)
    return returnValue
  }
})
```

### Async wrapping

For async calls, it's a bit harder. You'll need to locate the callback in the
arguments and wrap that too, so you can inject the second part.

```js
shimmer.wrap(abc, 'xyz', xyz => {
  return (n, trueCb) {
    const before = Date.now()
    function cb () {
      const after = Date.now()
      console.log(`xyz took ${after - before}ms`)
      return trueCb.apply(this, arguments)
    }
    return xyz.call(this, n, cb)
  }
})
```

## Using the instrumentation API

There are several different ways to use the instrumentation API, with varying
degrees of control.

### Basic instrumentaiton

Wherever possible, it is preferred that `tv.instrument(...)` is used, however
there are some alternatives, which we'll explore later. The `tv.instrument(...)`
function takes a layer name or builder function to produce a layer describing
the lifetime of the call and providing a mechanism of reporting metadata about
it.

#### Builder functions

The builder function receives a reference to the current layer, which you can
call `current.descend(...)` on to produce a new layer describing the call to be
instrumented. It accepts a layer name and an object with key/value pairs to be
serialized and sent as layer metadata.

```js
function build (current) {
  return current.descend('xyz', {
    foo: 'bar'
  })
}
```

#### Runner functions

Next up is the runner function. It is used to indirectly run the real function
you wish the instrument. For a sync call, it should have zero arguments. For an
async call, it should have one argument: a replacement callback.

```js
function asyncRunner () {
  return functionToInstrument(some, args, go, here)
}
```

```js
function asyncRunner (done) {
  return functionToInstrument(some, args, go, here, done)
}
```

#### Optional configuration

The third argument can optionally be a config object to toggle some features
of the instrumentation. It should contain `config.enabled = true` to turn the
instrumentation on, and can contain `config.collectBacktraces = true` to turn
on backtrace collection. Keep in mind that collecting backtraces may have a
lot of overhead.

#### Optional callback

When instrumenting an async function, a callback should be provided for the
runner to call when it completes. It can be in the fourth argument position,
if optional configs are included or the third position if configs are omitted.

The signature of the callback is unconstrained. It should match the usage of
the callback usage in the runner function. The only assumption made is that
the callback may have an error to report in the first argument position, but
this is not required. If it is something other than an error object, it will
simply be passed through as expected, without trying to report it.

#### Putting all that together

So if we wanted to use `tv.instrument(...)` to patch an async `abc.xyz` call,
it'd look something like this:

```js
shimmer.wrap(abc, 'xyz', xyz => {
  return function (n, cb) {
    const builder = current => current.descend('xyz', { n: n })
    const runner = done => xyz.call(this, n, done)
    return tv.instrument(builder, runner, { enabled: true }, cb)
  }
})
```

### Instrumenting HTTP requests

Sometimes you want to instrument something that is constrained to the lifetime
of a request rather than a discrete call and callback pairing. For these times
there is `tv.instrumentHttp(...)`. It shares most of the signature of the
`tv.instrument(...)` function, but with a response object in place of the
callback. It will trigger the exits in reverse chronological order when the
`end` event of the request is fired.

```js
http.createServer((req, res) => {
  const builder = current => current.descend('http-layer')
  const runner = () => res,send('done')
  tv.instrumentHttp(builder, runner, res)
})
```

### Advanced API usage

Sometimes `tv.instrument(...)` or `tv.instrumentHttp(...)` don't quite fit
what is needed for a given patch. For these situations, you can drop down to
the lower-level API. Those other functions are really just sugar over the
`Layer`	class. The current layer reference you'd expect to get from the builder
function can be acquired at `tv.Layer.last` and, as usual, you can call the
`current.descend(...)` function on that. The runner part is encapsulated in
`layer.runSync(fn)` and `layer.runAsync(fn)`, with a function length based
sugar wrapper around both of those at `layer.run(fn)`. When using the `Layer`
class, you will need to call both the run callback and the callback for the
instrumented function itself separately.

```js
const last = tv.Layer.last
const layer = last.descend('abc', {
  foo: 'bar'
})
layer.runSync(() => {
  console.log('doing some stuff')
})
```

### Starting or continuing a trace

The API methods demonstrated so far have all been geared toward use when a
trace is already in progress. When you aren't in a trace already, you might
need to start a fresh one. For this purpose, there is the
`tv.startOrContinueTrace(...)` function. The signature is almost identical
to `tv.instrument(...)` with the exception that it has an additional
optional xtrace argument at the beginning to provide the id of a trace to
continue from.

```js
tv.startOrContinueTrace(headers['X-Trace'], 'abc', done => {
  return setImmediate(done, a, b, c)
}, (a, b, c) => {
  console.log('called from setImmediate with:', a, b, c)
})
```

To get the current xtrace id to pass along through a header or some other
method, you can use the `tv.xtraceId` getter.

### Info and error events

Info and error events are simply insert into the current layer and can be
created with the `tv.reportInfo(...)` and `tv.reportError(...)` functions.

```js
tv.reportInfo({ foo: 'bar' })
tv.reportError(new Error('some error'))
tv.reportError('a string error')
```

## Context management

The agent propagates context storage alongside the code tree, to allow you to
store useful information about the state of things. Mostly it is used for
tracking past events to connect edges to.

### Accessing the context

The context is available as an object with `get(key)` and `set(key, value)`
methods at `tv.requestStore`. You can store whatever data you need in the store,
but it is *only* available within the specific branch of the continuation in
which the data was set. The continuation tracking begins when a call is made to
`tv.requestStore.run(functionToRunInContext)`.

```js
tv.requestStore.run(function () {
  tv.requestStore.set('foo', 'bar')
  var called = false

  setImmediate(function () {
    assert('bar', tv.requestStore.get('foo'))
    tv.requestStore.set('baz', 'buz')
    called = true

    setImmediate(after)
  })

  function after () {
    assert('buz', tv.requestStore.get('baz'))
  }

  setTimeout(function () {
    assert('bar', tv.requestStore.get('foo'))
    assert(null, tv.requestStore.get('baz'))
    assert(called, true)
  })
})
```

### Maintaining continuation

Unfortunately, due to the interleaving of requests caused by the event loop,
asynchronous boundaries must be linked together manually to keep track of
the code continuation of a given request call graph. Much of this is handled
automatically by the `async-listener` module, which is a dependency of
`continuation-local-storage`. However, there are sometimes instances of
user-mode queueing, like connection pools, which interfere with context
continuation. For this reason, it is sometimes necessary to use `tv.bind(...)`
and `tv.bindEmitter(...)` to bind callbacks and event emitters to the
context at the point which they are wrapped with.

```js
tv.bindEmitter(request)
tv.bindEmitter(response)

tv.requestStore.set('it works', true)

someAsyncThing(tv.bind(function () {
  res.on('end', function () {
    assert(true, tv.requestStore.get('it works'))
  })
}))
```
