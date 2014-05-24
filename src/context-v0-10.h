#ifndef OBOE_CONTEXT_H
#define OBOE_CONTEXT_H

#include <string>
#include <node.h>

namespace appneta {
namespace oboe {

class Event;
namespace context {

/**
 * Set the tracing mode.
 *
 * @param newMode One of
 * - OBOE_TRACE_NEVER(0) to disable tracing,
 * - OBOE_TRACE_ALWAYS(1) to start a new trace if needed, or
 * - OBOE_TRACE_THROUGH(2) to only add to an existing trace.
 */
void setTracingMode(int newMode) {
  oboe_settings_cfg_tracing_mode_set(newMode);
}

/**
 * Set the default sample rate.
 *
 * This rate is used until overridden by the TraceView servers.  If not set then the
 * value 300,000 will be used (ie. 30%).
 *
 * The rate is interpreted as a ratio out of OBOE_SAMPLE_RESOLUTION (currently 1,000,000).
 *
 * @param newRate A number between 0 (none) and OBOE_SAMPLE_RESOLUTION (a million)
 */
void setDefaultSampleRate(int newRate) {
  oboe_settings_cfg_sample_rate_set(newRate);
}

/**
 * Check if the current request should be traced based on the current settings.
 *
 * If xtrace is empty, or if it is identified as a foreign (ie. cross customer)
 * trace, then sampling will be considered as a new trace.
 * Otherwise sampling will be considered as adding to the current trace.
 * Different layers may have special rules.  Also special rules for AppView
 * Web synthetic traces apply if in_tv_meta is given a non-empty string.
 *
 * This is designed to be called once per layer per request.
 *
 * @param layer Name of the layer being considered for tracing
 * @param in_xtrace Incoming X-Trace ID (NULL or empty string if not present)
 * @param in_tv_meta AppView Web ID from X-TV-Meta HTTP header or higher layer (NULL or empty string if not present).
 * @return Zero to not trace; otherwise return the sample rate used in the low order
 *         bytes 0 to 2 and the sample source in the higher-order byte 3.
 */
int sampleRequest(
  std::string layer,
  std::string in_xtrace,
  std::string in_tv_meta
) {
  int sample_rate = 0;
  int sample_source = 0;
  int rc = oboe_sample_layer(
    layer.c_str(),
    in_xtrace.c_str(),
    in_tv_meta.c_str(),
    &sample_rate,
    &sample_source
  );

  return (rc == 0 ? 0 : (((sample_source & 0xFF) << 24) | (sample_rate & 0xFFFFFF)));
}

// returns pointer to current context (from thread-local storage)
oboe_metadata_t *get() {
  return oboe_context_get();
}

std::string toString() {
  char buf[OBOE_MAX_METADATA_PACK_LEN];

  oboe_metadata_t *md = context::get();
  int rc = oboe_metadata_tostr(md, buf, sizeof(buf) - 1);
  if (rc == 0) {
    return std::string(buf);
  } else {
    return std::string(); // throw exception?
  }
}

void set(oboe_metadata_t *md) {
  oboe_context_set(md);
}

void fromString(std::string s) {
  oboe_context_set_fromstr(s.data(), s.size());
}

// this new object is managed by SWIG %newobject
// static Metadata *copy() {
//   return new Metadata(context::get());
// }

void clear() {
  oboe_context_clear();
}

bool isValid() {
  return oboe_context_is_valid();
}

void init() {
  oboe_init();
}

// these new objects are managed by SWIG %newobject
Event *createEvent();
Event *startTrace();

}  // namespace context
}  // namespace oboe
}  // namespace appneta

#endif
