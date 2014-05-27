#ifndef OBOE_CONTEXT_H
#define OBOE_CONTEXT_H

#include <string>
#include <node.h>

namespace appneta {
namespace nodoboe {

class Metadata;
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
void setTracingMode(int newMode);

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
void setDefaultSampleRate(int newRate);

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
);

// returns pointer to current context (from thread-local storage)
oboe_metadata_t *get();

std::string toString();
void set(oboe_metadata_t *md);
void fromString(std::string s);

// this new object is managed by SWIG %newobject
static Metadata *copy();

void clear();
bool isValid();
void init();

// these new objects are managed by SWIG %newobject
Event *createEvent();
Event *startTrace();

}  // namespace context
}  // namespace nodoboe
}  // namespace appneta

#endif
