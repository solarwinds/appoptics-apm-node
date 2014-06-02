#include "node-oboe.h"

// Components
#include "metadata.cc"
#include "context.cc"
#include "config.cc"
#include "event.cc"
#include "reporters/udp.cc"

using v8::Handle;
using v8::Object;

// Register the exposed parts of the module
void Init(Handle<Object> exports) {
	NanScope();

	exports->Set(NanSymbol("MAX_SAMPLE_RATE"), NanNew<Uint32>(OBOE_SAMPLE_RESOLUTION));
	exports->Set(NanSymbol("MAX_METADATA_PACK_LEN"), NanNew<Uint32>(OBOE_MAX_METADATA_PACK_LEN));
	exports->Set(NanSymbol("MAX_TASK_ID_LEN"), NanNew<Uint32>(OBOE_MAX_TASK_ID_LEN));
	exports->Set(NanSymbol("MAX_OP_ID_LEN"), NanNew<Uint32>(OBOE_MAX_OP_ID_LEN));

	UdpReporter::Init(exports);
  OboeContext::Init(exports);
  Metadata::Init(exports);
  Event::Init(exports);
  Config::Init(exports);
}

NODE_MODULE(node_oboe, Init)
