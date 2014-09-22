#include "node-oboe.h"

// Components
#include "sanitizer.cc"
#include "metadata.cc"
#include "context.cc"
#include "config.cc"
#include "event.cc"
#include "reporters/udp.cc"
#include "reporters/file.cc"

using v8::Handle;
using v8::Object;

extern "C" {

// Register the exposed parts of the module
void init(Handle<Object> exports) {
	NanScope();

	exports->Set(NanNew<String>("MAX_SAMPLE_RATE"), NanNew<Uint32>(OBOE_SAMPLE_RESOLUTION));
	exports->Set(NanNew<String>("MAX_METADATA_PACK_LEN"), NanNew<Uint32>(OBOE_MAX_METADATA_PACK_LEN));
	exports->Set(NanNew<String>("MAX_TASK_ID_LEN"), NanNew<Uint32>(OBOE_MAX_TASK_ID_LEN));
	exports->Set(NanNew<String>("MAX_OP_ID_LEN"), NanNew<Uint32>(OBOE_MAX_OP_ID_LEN));

	exports->Set(NanNew<String>("TRACE_NEVER"), NanNew<Uint32>(OBOE_TRACE_NEVER));
	exports->Set(NanNew<String>("TRACE_ALWAYS"), NanNew<Uint32>(OBOE_TRACE_ALWAYS));
	exports->Set(NanNew<String>("TRACE_THROUGH"), NanNew<Uint32>(OBOE_TRACE_THROUGH));

	FileReporter::Init(exports);
	UdpReporter::Init(exports);
	OboeContext::Init(exports);
	Sanitizer::Init(exports);
  Metadata::Init(exports);
  Event::Init(exports);
  Config::Init(exports);

	oboe_init();
}

NODE_MODULE(node_oboe, init)

}
