* implementation strategy
  - implement Metabuf class (may get renamed to Metadata when complete).
  - create Metabuf tests
  - don't require changes to bindings until the agent functions (as much as possible). one example:
    ignore the metadata (wrong format) returned by getTraceSettings() and just supply the metabuf
    that will be used in the new system. this may not be viable but it's worth a try.
  - rewrite test/basics.test.js to test new metabuf functionality - first milestone is passing this
  - rewrite test/event.test.js and re-evaluate whether various properties (e.g., .taskId, .opId, etc. are useful)
  - BIG find all metadata references. consider converting internal use but keeping docs the same (many)
  - requires moving much of addon-sim to addon.
  - apis, api-sims, index.js (init msg), http (xtrace checks)

- unix time in microseconds
  combination of hrtime and date.now() - https://github.com/sazze/node-nanotime/blob/master/index.js.
  can have single date.now() * 1000 at startup of C++ send routine and make the event timestamp using the
  hrtime delta at startup, converted to microseconds. check Number.MAX_SAFE_INTEGER and range for overflow.
  event can probably just capture the hdtime delta (compared to startup) and set a property, not a KV,
  because it will need to be adjusted by adding it to the base unix timestamp (gettimeofday). Question: how
  to get two bases (unix ts and hrtime) as close as possible so the time is not skewed. Maybe a C++ call
  that is only called once at startup - sets static unix ts base and returns hrtime base.

- abstract edges better. create addEdge() method. remove all event.edges.push(...) instances. get rid of
  getters/setters.

- deprecate Event.last in favor of ao.lastEvent.

- rename requestStore => context.

- get rid of Event.sendStatus() - used only for init message. replace with optional second arg that
  determines channel. more in event-2.cc (bindings).

- repurpose event completely - all javascript until event.send()
  constructor expects metadata, not event, or both? capture edges, KVs, etc.

- there will be no oboe metadata, just events which contain a Buffer that holds the x-trace form of metadata.
  the only time an oboe event or metadata will be constructed is in the bindings Event.send() function -
  completely new. actually an oboe event is nothing more than metadata with a bson buffer and string. and the
  metadata object carries along lengths which are constant for any given build/version combination, so no need
  to carry that redundant information. a version will suffice if there is ever a change.

- bindings - Event & Metadata will go away. New function in Event namespace (most likely, or Reporter) that
  will send an array of events. Each event will have all the KV pairs, edges, and metadata (in a Metabuf)
  required to construct an oboe event and then send it. TBD whether JS preprocesses the events or whether
  that is left to the C++ code. probably C++ code.

  basically something like:

```
oboe_event_init(&event, &metadata, &opid);         // use agent-event-metabuf for metadata and opid

loop:
oboe_event_add_info<_type> (&event, key, value);   // for all agent KV & also timestamp & hostname
loop:
oboe_event_add_edge(&event, edge);                 // if any

oboe_bson_buffer_finish(&event);

oboe_raw_send(&event);

```
- bindings: might need an hrtime/unix-time base function.
- bindings: getTraceSettings() changes - no longer create metadata.

- agent: rework event code to use Metabuf. (only 3 "new Event" calls)
- agent: rework all uses of metadata. keep name Metadata to minimize breakage. use Metabuf internally for sanity.
- agent: rework getTraceSettings()
- agent: validates x-trace strings (simple, done)
- agent: span changes TBD


- formatters - log-formatters and toString() functions for low-level bindings metadata.


perf notes

js => c++ transitions
- getTraceSettings()
- create Event
- every KV pair
- every edge
- send Event

