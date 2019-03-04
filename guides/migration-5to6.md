
## appoptics-apm migration guide v5 => v6

### Background

Prior to v6 `appoptics-apm` made the decision whether to sample or not in the `Event` constructor. `appoptics-apm` now makes the decision at the starting point of a trace, e.g., the `http` probe. This change simplifies the code but introduces breaking changes if you are using custom-instrumentation.

N.B. If you are only using instrumentation out of the box, i.e., you have not written any custom instrumentation, no changes are necessary to migrate to v6.

If you are using custom instrumentation read on!

### High-level API change

In both v5 and v6 the span argument to an instrumentation function could be a string or a function. In v6 the function signature has changed.

- in v5 the function received an argument of the previous span and returned a created span, e.g., `span = spanMaker(lastSpan)`
- in v6 the function receives no arguments and returns a plain object, `spanInfo` (see `spanInfo` in guides/api.md). `spanInfo` properties:
    - required - a string `name` property. This is what the span will be named.
    - optional - an object `kvpairs` property. This contains key-value pairs to attach to the span's entry envent.
    - optional - a function `finalize` property. This is called after creating the span. The newly created span is its argument. The primary use for this is internal.

In v5 the option `enabled` defaulted to `false`. In v6 it defaults to `true`.

These are the functions that require changes if they are being called with a span-builder function or the presumption that no options argument defaults `enabled` to `false`. No change is necessary if they are being called with a string span name or an options argument with `{enabled: true}`.

- `ao.instrument`
- `ao.instrumentHttp`
- `ao.startOrContinueTrace`

```
// v5 spanMaker, options are required because enabled defaults to false
function spanMaker (last) {
    return last.descend('awesome-span', {special: 'special-value'})
}
return ao.instrument(spanMaker, runner, {enabled: true}, cb)


// v6 - spanInfo, note that enabled defaults to true.
function spanInfo () {
    return {name: 'awesome-span', kvpairs: {special: 'special-value}}
}
return ao.instrument(spanInfo, runner, cb)

```

### Low-level API changes

There are numerous low-level API changes so if you're working at this lower level feel free to contact us as this is list only hits the most obvious.

- `ao.sample()` has been removed and `ao.getTraceSettings()` is now used to determine all trace settings.
- `Span` constructor signature has changed. v5: `new Span(name, parent, kvpairs)` v6: `new Span(name, settings, kvpairs)` where settings is the object returned by `getTraceSettings()`.
- the span factory, `Span.makeEntrySpan()` is used to create top-level, e.g., http, spans. This replaces directly calling the `Span` constructor with the right combination of arguments.
- `Event` constructor signature has changed. v5: `new Event(span, label, parent)` v6: `new Event(span, label, parent, edge)`. The added edge argument is the most obvious change, but parent must now be an instance of `addon.Event` or `addon.Metadata`. The event constructor uses this metadata to construct the event; it will no longer create random metadata on its own.
- `ao.addon` - there are many breaking changes. If you are using an of these functions directly let us know and we'll work with you to update your code.

