## Objects

<dl>
<dt><a href="#ao">ao</a> : <code>object</code></dt>
<dd></dd>
</dl>

## Typedefs

<dl>
<dt><a href="#SampleInfo">SampleInfo</a> : <code>object</code></dt>
<dd></dd>
</dl>

<a name="ao"></a>

## ao : <code>object</code>
**Kind**: global namespace  

* [ao](#ao) : <code>object</code>
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
    * [.startOrContinueTrace(xtrace, build, run, [options], [callback])](#ao.startOrContinueTrace)
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
**Returns**: <code>string</code> \| <code>undefined</code> - - the log levels in effect or undefined if an error  

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
**Returns**: <code>string</code> \| <code>undefined</code> - - log levels active after removals or undefined if an error.  

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

UNKNOWN 0
OK 1
TRY_LATER 2
LIMIT_EXCEEDED 3
INVALID_API_KEY 4
CONNECT_ERROR 5  

| Param | Type | Description |
| --- | --- | --- |
| ms | <code>Number</code> | milliseconds to wait; default 0 means don't wait (poll). |
| [obj] | <code>Object</code> | if present obj.status will receive low level status |

<a name="ao.bind"></a>

### ao.bind(fn) ⇒ <code>function</code>
Bind a function to the CLS context if tracing.

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>function</code> - The bound function or the original function if it can't be bound.  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> | The function to bind to the context |

<a name="ao.bindEmitter"></a>

### ao.bindEmitter(em) ⇒ <code>EventEmitter</code>
Bind an emitter, if tracing

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>EventEmitter</code> - The bound emitter or the original emitter if it can't be bound.  

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
| fn | <code>function</code> | A function that returns a string name to use or a falsey                        value to use the default. The calling signature of the                        function varies by the probe.                        Pass a falsey value instead of a function to clear. |

<a name="ao.sampling"></a>

### ao.sampling(item) ⇒ <code>boolean</code>
Determine if the sample flag is set for the various forms of
metadata.

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>boolean</code> - - true if the sample flag is set else false.  

| Param | Type | Description |
| --- | --- | --- |
| item | <code>string</code> \| <code>Event</code> \| <code>Metadata</code> | the item to check the sampling flag of |

<a name="ao.stringToMetadata"></a>

### ao.stringToMetadata(metadata) ⇒ <code>bindings.Metadata</code> \| <code>undefined</code>
Convert an xtrace ID to a metadata object.

**Kind**: static method of [<code>ao</code>](#ao)  
**Returns**: <code>bindings.Metadata</code> \| <code>undefined</code> - - bindings.Metadata object if successful.  

| Param | Type | Description |
| --- | --- | --- |
| metadata | <code>string</code> | string metadata (X-Trace ID) |

<a name="ao.instrumentHttp"></a>

### ao.instrumentHttp(build, run, [options], res)
Instrument HTTP request/response

**Kind**: static method of [<code>ao</code>](#ao)  

| Param | Type | Description |
| --- | --- | --- |
| build | <code>string</code> \| <code>function</code> | Span name or builder function |
| run | <code>function</code> | Code to instrument and run |
| [options] | <code>object</code> | Options |
| [options.enabled] | <code>object</code> | Enable tracing, on by default |
| [options.collectBacktraces] | <code>object</code> | Collect backtraces |
| res | <code>HTTPResponse</code> | HTTP Response to patch |

<a name="ao.instrument"></a>

### ao.instrument(build, run, [options], [callback])
Apply custom instrumentation to a function.

**Kind**: static method of [<code>ao</code>](#ao)  

| Param | Type | Description |
| --- | --- | --- |
| build | <code>string</code> \| <code>function</code> | Span name or builder function |
| run | <code>function</code> | Code to instrument and run |
| [options] | <code>object</code> | Options |
| [options.enabled] | <code>boolean</code> | Enable tracing, on by default |
| [options.collectBacktraces] | <code>boolean</code> | Enable tracing, on by default |
| [callback] | <code>function</code> | Callback, if async A `build` function is run only when tracing; it is used to generate a span. It can include custom data, but custom data can not be nested and all values must be strings or numbers. The `run` function runs the function which you wish to instrument. Rather than giving it a callback directly, you give the done argument. This tells AppOptics when your instrumented code is done running. The `callback` function is simply the callback you normally would have given directly to the code you want to instrument. It receives the same arguments as were received by the `done` callback for the `run` function, and the same `this` context is also applied to it.     function build (last) {       return last.descend('custom', { Foo: 'bar' })     }     function run (done) {       fs.readFile('some-file', done)     }     function callback (err, data) {       console.log('file contents are: ' + data)     }     ao.instrument(build, run, callback) |

<a name="ao.startOrContinueTrace"></a>

### ao.startOrContinueTrace(xtrace, build, run, [options], [callback])
Start or continue a trace

**Kind**: static method of [<code>ao</code>](#ao)  

| Param | Type | Description |
| --- | --- | --- |
| xtrace | <code>string</code> | X-Trace ID to continue from |
| build | <code>string</code> \| <code>function</code> | Name or function to build a span |
| run | <code>function</code> | Code to instrument and run |
| [options] | <code>object</code> | Options |
| [options.enabled] | <code>boolean</code> | Enable tracing |
| [options.collectBacktraces] | <code>boolean</code> | Collect backtraces |
| [callback] | <code>function</code> | Callback, if async |

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

<a name="SampleInfo"></a>

## SampleInfo : <code>object</code>
**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| sample | <code>boolean</code> | whether to sample or not |
| source | <code>number</code> | the source of the sample decision |
| rate | <code>number</code> | the rate that was used to make the decision |

