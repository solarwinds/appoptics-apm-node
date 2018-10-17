## Classes

<dl>
<dt><a href="#ao">ao</a></dt>
<dd></dd>
<dt><a href="#Span">Span</a></dt>
<dd></dd>
<dt><a href="#Event">Event</a></dt>
<dd></dd>
</dl>

## Typedefs

<dl>
<dt><a href="#SampleInfo">SampleInfo</a> : <code>object</code></dt>
<dd></dd>
</dl>

<a name="ao"></a>

## ao
**Kind**: global class  

* [ao](#ao)
    * [.logLevel](#ao.logLevel)
    * [.serviceKey](#ao.serviceKey)
    * [.sampleMode](#ao.sampleMode)
    * [.traceMode](#ao.traceMode)
    * [.sampleRate](#ao.sampleRate)
    * [.tracing](#ao.tracing)
    * [.traceId](#ao.traceId)
    * [.loggers](#ao.loggers)
    * [.logLevelAdd(levels)](#ao.logLevelAdd) ⇒ <code>string</code> \| <code>undefined</code>
    * [.logLevelRemove(levels)](#ao.logLevelRemove) ⇒ <code>string</code> \| <code>undefined</code>
    * [.readyToSample(ms, [obj])](#ao.readyToSample) ⇒ <code>boolean</code>
    * [.bind(fn)](#ao.bind) ⇒ <code>function</code>
    * [.bindEmitter(em)](#ao.bindEmitter) ⇒ <code>EventEmitter</code>
    * [.backtrace()](#ao.backtrace)
    * [.setCustomTxNameFunction(probe, fn)](#ao.setCustomTxNameFunction)
    * [.sampling(item)](#ao.sampling) ⇒ <code>boolean</code>
    * [.stringToMetadata(metadata)](#ao.stringToMetadata) ⇒ <code>bindings.Metadata</code> \| <code>undefined</code>
    * [.instrumentHttp(build, run, [options], res)](#ao.instrumentHttp)
    * [.instrument(build, run, [options], [callback])](#ao.instrument)
    * [.startOrContinueTrace(xtrace, build, run, [opts], [callback])](#ao.startOrContinueTrace)
    * [.reportError(error)](#ao.reportError)
    * [.reportInfo(data)](#ao.reportInfo)

<a name="ao.logLevel"></a>

### ao.logLevel
**Kind**: static property of [<code>ao</code>](#ao)  
**Properties**

| Type | Description |
| --- | --- |
| <code>string</code> | comma separated list of log settings |

**Example** *(Sets the log settings)*  
```js
ao.logLevel = 'warn,error'
```
**Example** *(Get the log settings)*  
```js
var settings = ao.logLevel
```
<a name="ao.serviceKey"></a>

### ao.serviceKey
**Kind**: static property of [<code>ao</code>](#ao)  
**Properties**

| Type | Description |
| --- | --- |
| <code>string</code> | the service key |

<a name="ao.sampleMode"></a>

### ao.sampleMode
Get and set the sample mode

**Kind**: static property of [<code>ao</code>](#ao)  
**Properties**

| Type | Description |
| --- | --- |
| <code>string</code> | the sample mode |

<a name="ao.traceMode"></a>

### ao.traceMode
Get and set the sample mode. This is an alias for 'sampleMode' and
is for consistency with other agents and history.

**Kind**: static property of [<code>ao</code>](#ao)  
**Properties**

| Type | Description |
| --- | --- |
| <code>string</code> | the sample mode |

<a name="ao.sampleRate"></a>

### ao.sampleRate
Get and set the sample rate. The number is parts of 1,000,000
so 100,000 represents a 10% sample rate.

**Kind**: static property of [<code>ao</code>](#ao)  
**Properties**

| Type | Description |
| --- | --- |
| <code>number</code> | this value divided by 1000000 is the sample rate. |

<a name="ao.tracing"></a>

### ao.tracing
Return whether or not the current code path is being traced.

**Kind**: static property of [<code>ao</code>](#ao)  
**Read only**: true  
**Properties**

| Type |
| --- |
| <code>boolean</code> | 

<a name="ao.traceId"></a>

### ao.traceId
Get X-Trace ID of the last event

**Kind**: static property of [<code>ao</code>](#ao)  
**Read only**: true  
**Properties**

| Type | Description |
| --- | --- |
| <code>string</code> | the trace ID as a string or undefined if not tracing. |

<a name="ao.loggers"></a>

### ao.loggers
Expose debug logging global and create a function to turn
logging on/off.

**Kind**: static property of [<code>ao</code>](#ao)  
**Properties**

| Type | Description |
| --- | --- |
| <code>object</code> | the loggers available for use |

<a name="ao.logLevelAdd"></a>

### ao.logLevelAdd(levels) ⇒ <code>string</code> \| <code>undefined</code>
Add log levels to the existing set of log levels.

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>string</code> \| <code>undefined</code> - - the current log levels or undefined if an error  

| Param | Type | Description |
| --- | --- | --- |
| levels | <code>string</code> | comma separated list of levels to add |

**Example**  
```js
ao.logLevelAdd('warn,debug')
```
<a name="ao.logLevelRemove"></a>

### ao.logLevelRemove(levels) ⇒ <code>string</code> \| <code>undefined</code>
Remove log levels from the current set.

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>string</code> \| <code>undefined</code> - - log levels after removals or undefined if an
                             error.  

| Param | Type | Description |
| --- | --- | --- |
| levels | <code>string</code> | comma separated list of levels to remove |

**Example**  
```js
var previousLogLevel = ao.logLevel
ao.logLevelAdd('debug')
ao.logLevelRemove(previousLogLevel)
```
<a name="ao.readyToSample"></a>

### ao.readyToSample(ms, [obj]) ⇒ <code>boolean</code>
Check whether the appoptics agent is ready to sample. It will wait up to
the specified number of milliseconds before returning.

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>boolean</code> - - true if ready to sample; false if not  

| Param | Type | Description |
| --- | --- | --- |
| ms | <code>Number</code> | milliseconds to wait; default 0 means don't wait (poll). |
| [obj] | <code>Object</code> | if present obj.status will receive low level status |

<a name="ao.bind"></a>

### ao.bind(fn) ⇒ <code>function</code>
Bind a function to the CLS context if tracing.

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>function</code> - The bound function or the unmodified argument if it can't
  be bound.  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> | The function to bind to the context |

<a name="ao.bindEmitter"></a>

### ao.bindEmitter(em) ⇒ <code>EventEmitter</code>
Bind an emitter, if tracing

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>EventEmitter</code> - The bound emitter or the original emitter if an error.  

| Param | Type | Description |
| --- | --- | --- |
| em | <code>EventEmitter</code> | The emitter to bind to the trace context |

<a name="ao.backtrace"></a>

### ao.backtrace()
Generate a backtrace string

**Kind**: static method of [<code>ao</code>](#ao)  
<a name="ao.setCustomTxNameFunction"></a>

### ao.setCustomTxNameFunction(probe, fn)
Set a custom transaction name function for a specific probe. This is
most commonly used when setting custom names for all or most routes.

**Kind**: static method of [<code>ao</code>](#ao)  

| Param | Type | Description |
| --- | --- | --- |
| probe | <code>string</code> | The probe to set the function for |
| fn | <code>function</code> | A function that returns a string custom name or a                        falsey value indicating the default should be used.                        Pass a falsey value for the function to clear. |

**Example**  
```js
// custom transaction function signatures for supported probes:
express: customFunction (req, res)
hapi: customFunction (request)
```
<a name="ao.sampling"></a>

### ao.sampling(item) ⇒ <code>boolean</code>
Determine if the sample flag is set for the various forms of
metadata.

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>boolean</code> - - true if the sample flag is set else false.  

| Param | Type | Description |
| --- | --- | --- |
| item | <code>string</code> \| [<code>Event</code>](#Event) \| <code>Metadata</code> | the item to get the sampling flag of |

<a name="ao.stringToMetadata"></a>

### ao.stringToMetadata(metadata) ⇒ <code>bindings.Metadata</code> \| <code>undefined</code>
Convert an xtrace ID to a metadata object.

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>bindings.Metadata</code> \| <code>undefined</code> - - bindings.Metadata object if
                                        successful.  

| Param | Type | Description |
| --- | --- | --- |
| metadata | <code>string</code> | string metadata (X-Trace ID) |

<a name="ao.instrumentHttp"></a>

### ao.instrumentHttp(build, run, [options], res)
Instrument HTTP request/response

**Kind**: static method of [<code>ao</code>](#ao)  

| Param | Type | Description |
| --- | --- | --- |
| build | <code>string</code> \| <code>function</code> | span name or builder function |
| run | <code>function</code> | code to instrument and run |
| [options] | <code>object</code> | options |
| [options.enabled] | <code>object</code> | enable tracing, on by default |
| [options.collectBacktraces] | <code>object</code> | collect backtraces |
| res | <code>HTTPResponse</code> | HTTP response to patch |

<a name="ao.instrument"></a>

### ao.instrument(build, run, [options], [callback])
Apply custom instrumentation to a function.

**Kind**: static method of [<code>ao</code>](#ao)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| build | <code>string</code> \| <code>function</code> |  | span name or builder function     If `build` is a string then a span is created with that name. If it     is a function it will be run only if tracing; it must generate a     a span. |
| run | <code>function</code> |  | the function to instrument<br/><br/>     Synchronous `run` function:<br/>     the signature has no callback, e.g., `function run () {...}`. If a     synchronous `run` function throws an error appoptics will report that     error for the span and re-throw the error.<br/>     <br/>     Asynchronous `run` function:<br/>     the signature must include a done callback that is used to let     AppOptics know when your instrumented async code is done running,     e.g., `function run (done) {...}`. In order to report an error for     an async span the done function must be called with an Error object     as the argument. |
| [options] | <code>object</code> |  | options |
| [options.enabled] | <code>boolean</code> | <code>true</code> | enable tracing |
| [options.collectBacktraces] | <code>boolean</code> | <code>false</code> | collect stack traces. |
| [callback] | <code>function</code> |  | optional callback, if async |

**Example**  
```js
//
// A synchronous `run` function.
//
//   If the run function is synchronous the signature does not include
//   a callback, e.g., `function run () {...}`.
//

function build (last) {
  return last.descend('custom', {Foo: 'bar'})
}

function run () {
  const contents = fs.readFileSync('some-file', 'utf8')
  // do things with contents
}

ao.instrument(build, run)
```
**Example**  
```js
//
// An asynchronous `run` function.
//
// Rather than callback directly, you give the done argument.
// This tells AppOptics when your instrumented code is done running.
//
// The `callback` function is the callback you normally would have given
// directly to the code you want to instrument. It receives the same
// arguments as were received by the `done` callback for the `run` function
// and the same `this` context is also applied to it.

function build (last) {
  return last.descend('custom', {Foo: 'bar'})
}

function run (done) {
  fs.readFile('some-file', done)
}

function callback (err, data) {
  console.log('file contents are: ' + data)
}

ao.instrument(build, run, callback)
```
<a name="ao.startOrContinueTrace"></a>

### ao.startOrContinueTrace(xtrace, build, run, [opts], [callback])
Start or continue a trace. Continue is in the sense of continuing a
trace based on an X-Trace ID received from an external source, e.g.,
HTTP headers or message queue headers.

**Kind**: static method of [<code>ao</code>](#ao)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| xtrace | <code>string</code> |  | X-Trace ID to continue from or null |
| build | <code>string</code> \| <code>function</code> |  | name or function to return a span |
| run | <code>function</code> |  | run the code. if sync, no arguments, else one |
| [opts] | <code>object</code> |  | options |
| [opts.enabled] | <code>boolean</code> | <code>true</code> | enable tracing |
| [opts.collectBacktraces] | <code>boolean</code> | <code>false</code> | collect backtraces |
| [opts.customTxName] | <code>string</code> \| <code>function</code> |  | name or function |
| [callback] | <code>function</code> |  | Callback, if async |

**Example**  
```js
ao.startOrContinueTrace(
  null,
  'sync-span-name',
  functionToRun,           // synchronous so function takes no arguments
  {customTxName: 'special-span-name'}
)
```
**Example**  
```js
ao.startOrContinueTrace(
  null,
  'sync-span-name',
  functionToRun,
  // note - no context is provided for the customTxName function. If
  // context is required the caller should wrap the function in a closure.
  {customTxName: customNameFunction}
)
```
**Example**  
```js
// this is the function that should be instrumented
request('https://www.google.com', function realCallback (err, res, body) {...})
// because asyncFunctionToRun only accepts one parameter it must be
// wrapped, so the function to run becomes
function asyncFunctionToRun (cb) {
  request('https://www.google.com', cb)
}
// and realCallback is supplied as the optional callback parameter

ao.startOrContinueTrace(
  null,
  'async-span-name',
  asyncFunctionToRun,     // async, so function takes one argument
  // no options this time
  realCallback            // receives request's callback arguments.
)
```
<a name="ao.reportError"></a>

### ao.reportError(error)
Report an error event in the current trace.

**Kind**: static method of [<code>ao</code>](#ao)  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>Error</code> | The error instance to report |

<a name="ao.reportInfo"></a>

### ao.reportInfo(data)
Report an info event in the current trace.

**Kind**: static method of [<code>ao</code>](#ao)  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>object</code> | Data to report in the info event |

<a name="Span"></a>

## Span
**Kind**: global class  

* [Span](#Span)
    * [new Span(name, parent, [data])](#new_Span_new)
    * [.descend(name, data)](#Span+descend)
    * [.run(fn)](#Span+run)
    * [.runAsync(fn, [rootOpts])](#Span+runAsync)
    * [.runSync(fn, [rootOpts])](#Span+runSync)
    * [.enter(data)](#Span+enter)
    * [.exit(data)](#Span+exit)
    * [.exitWithError(err, data)](#Span+exitWithError)
    * [.setExitError(err)](#Span+setExitError)
    * [.info(data)](#Span+info)
    * [.error(data)](#Span+error)

<a name="new_Span_new"></a>

### new Span(name, parent, [data])
Create an execution span.


| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | Span name |
| parent | <code>string</code> \| [<code>Event</code>](#Event) | Context to continue from |
| [data] | <code>object</code> | Key/Value pairs of info to add to event |

**Example**  
```js
var span = new Span('fs', Event.last, {
  File: file
})
```
<a name="Span+descend"></a>

### span.descend(name, data)
Create a new span descending from the current span

**Kind**: instance method of [<code>Span</code>](#Span)  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | Span name |
| data | <code>object</code> | Key/Value pairs of info to add to the entry event |

**Example**  
```js
var inner = outer.descend('fs', {
  File: file
})
```
<a name="Span+run"></a>

### span.run(fn)
Run a function within the context of this span. Similar to mocha, this
identifies asynchronicity by function arity and invokes runSync or runAsync

**Kind**: instance method of [<code>Span</code>](#Span)  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> | function to run within the span context |

**Example**  
```js
span.run(function () {
  syncCallToTrace()
})
```
**Example**  
```js
span.run(function (wrap) {
  asyncCallToTrace(wrap(callback))
})
```
<a name="Span+runAsync"></a>

### span.runAsync(fn, [rootOpts])
Run an async function within the context of this span.

**Kind**: instance method of [<code>Span</code>](#Span)  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> | async function to run within the span context |
| [rootOpts] | <code>object</code> | presence indicates that this is a root span |
| [rootOpts.defaultTxName] | <code>string</code> | default transaction name to use |
| [rootOpts.customTxName] | <code>string</code> \| <code>function</code> | string or function |

**Example**  
```js
span.runAsync(function (wrap) {
  asyncCallToTrace(wrap(callback))
})
```
<a name="Span+runSync"></a>

### span.runSync(fn, [rootOpts])
Run a sync function within the context of this span.

**Kind**: instance method of [<code>Span</code>](#Span)  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> | sync function to run withing the span context |
| [rootOpts] | <code>object</code> | presence indicates that this is a root span |
| [rootOpts.defaultTxName] | <code>string</code> | the default transaction name |
| [rootOpts.customTxName] | <code>string</code> \| <code>function</code> | string or function |

**Example**  
```js
span.runSync(function () {
  syncCallToTrace()
})
```
<a name="Span+enter"></a>

### span.enter(data)
Send the enter event

**Kind**: instance method of [<code>Span</code>](#Span)  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>object</code> | Key/Value pairs of info to add to event |

**Example**  
```js
span.enter()
syncCallToTrace()
span.exit()
```
**Example**  
```js
// If using enter/exit to trace async calls, you must flag it as async
// manually and bind the callback to maintain the trace context
span.async = true
span.enter()
asyncCallToTrace(ao.bind(function (err, res) {
  span.exit()
  callback(err, res)
}))
```
<a name="Span+exit"></a>

### span.exit(data)
Send the exit event

**Kind**: instance method of [<code>Span</code>](#Span)  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>object</code> | key-value pairs of info to add to event |

<a name="Span+exitWithError"></a>

### span.exitWithError(err, data)
Send the exit event with an error status

**Kind**: instance method of [<code>Span</code>](#Span)  

| Param | Type | Description |
| --- | --- | --- |
| err | <code>Error</code> | Error to add to event |
| data | <code>object</code> | Key/Value pairs of info to add to event |

<a name="Span+setExitError"></a>

### span.setExitError(err)
Set an error to be sent with the exit event

**Kind**: instance method of [<code>Span</code>](#Span)  

| Param | Type | Description |
| --- | --- | --- |
| err | <code>Error</code> | Error to add to event |

<a name="Span+info"></a>

### span.info(data)
Create and send an info event

**Kind**: instance method of [<code>Span</code>](#Span)  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>object</code> | key-value pairs to add to event |

**Example**  
```js
span.info({Foo: 'bar'})
```
<a name="Span+error"></a>

### span.error(data)
Create and send an error event

**Kind**: instance method of [<code>Span</code>](#Span)  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>object</code> | Key/Value pairs to add to event |

**Example**  
```js
span.error(error)
```
<a name="Event"></a>

## Event
**Kind**: global class  

* [Event](#Event)
    * [new Event(span, label, parent)](#new_Event_new)
    * [.set(data)](#Event+set)
    * [.enter()](#Event+enter)
    * [.toString()](#Event+toString)
    * [.sendReport(data)](#Event+sendReport)

<a name="new_Event_new"></a>

### new Event(span, label, parent)
Create an event


| Param | Type | Description |
| --- | --- | --- |
| span | <code>string</code> | name of the event's span |
| label | <code>string</code> | Event label (usually entry or exit) |
| parent | <code>object</code> | Parent event to edge back to |

<a name="Event+set"></a>

### event.set(data)
Set key-value pairs on this event

**Kind**: instance method of [<code>Event</code>](#Event)  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>object</code> | Key/Value pairs of info to add to event |

<a name="Event+enter"></a>

### event.enter()
Enter the context of this event

**Kind**: instance method of [<code>Event</code>](#Event)  
<a name="Event+toString"></a>

### event.toString()
Get the X-Trace ID string of the event

**Kind**: instance method of [<code>Event</code>](#Event)  
<a name="Event+sendReport"></a>

### event.sendReport(data)
Send this event to the reporter

**Kind**: instance method of [<code>Event</code>](#Event)  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>object</code> | additional key-value pairs to send |

<a name="SampleInfo"></a>

## SampleInfo : <code>object</code>
**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| sample | <code>boolean</code> | whether to sample or not |
| source | <code>number</code> | the source of the sample decision |
| rate | <code>number</code> | the rate that was used to make the decision |

