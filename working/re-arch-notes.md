
## implementation strategy

done
- implement Metabuf class (may get renamed to Metadata when complete). worked well
- create Metabuf tests - worked well
- don't require changes to bindings until the agent functions (as much as possible). one
example: ignore the metadata (wrong format) returned by getTraceSettings() and just
supply the metabuf that will be used in the new system. this may not be viable but it's
worth a try. - worked but minor
- rewrite test/basics.test.js to test new metabuf functionality - first milestone is passing
this - worked.
- rewrite test/event.test.js and re-evaluate whether various properties (e.g., .taskId, .opId,
 etc. are useful) - worked

remaining
- BIG find all metadata references. consider converting internal use but keeping docs the
same (many)
- requires moving much of addon-sim to addon.
- apis, api-sims, index.js (init msg), http (xtrace checks)

## questions

- should Event constructor accept both Events and Metabuf-metadata?
- pretty tight coupling between bindings Event::send(), OBOE_* constants, and Metabuf. another way?

## details - items to do

- provide initialization time check that verifies aob metadata constants are the same
  as Metabuf uses.

- make sure nothing but a Metabuf goes into Event._edges.

- abstract edges better. create addEdge() method. remove all event.edges.push(...) instances. get rid of
  getters/setters.

- deprecate Event.last in favor of ao.lastEvent.

- rename requestStore => context.

- rename Event.set() => Event.addKV()

- remove already gone bindings.Context.sampleTrace() references (testing, api-sim).

- agent: rework getTraceSettings()
- agent: span changes TBD
- formatters - log-formatters and toString() functions for low-level bindings metadata.

## details - done##

- ~~unix time in microseconds~~ done. see api.js/getUnixTimeMicroseconds().
- ~~agent: rework event code to use Metabuf. (only 3 "new Event" calls)~~
- ~~bindings: getTraceSettings() changes - creates Metabuf, not oboe metadata.~~
- ~~repurpose event completely - all javascript until event.send()
  constructor expects metadata, not event, or both? capture edges, KVs, etc.~~
- ~~get rid of Event.sendStatus() - used only for init message. replace with optional second arg that
  determines channel. more in event.cc (bindings).~~
- ~~there will be no oboe metadata, just events which contain a Buffer that holds the x-trace form of metadata.
  the only time an oboe event or metadata will be constructed is in the bindings Event.send() function -
  completely new. actually an oboe event is nothing more than metadata with a bson buffer and string. and the
  metadata object carries along lengths which are constant for any given build/version combination, so no need
  to carry that redundant information. a version will suffice if there is ever a change.~~
- ~~bindings - Event & Metadata will go away. New function in Event namespace (most likely, or Reporter) that
  will send an array of events. Each event will have all the KV pairs, edges, and metadata (in a Metabuf)
  required to construct an oboe event and then send it.~~
- ~~bindings: might need an hrtime/unix-time base function.~~
- ~~agent: validates x-trace strings~~

perf notes

initial js => c++ transitions
- inbound xtrace validation
- getTraceSettings() +1 if error
- create Event
- every KV pair
- edges (2) set edge, send edge
- every toString() - log insertion, outbound x-trace headers, logging.
- send Event

trash-metadata js => c++ transitions
- getTraceSettings()
- send Event()
