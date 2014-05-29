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

	UdpReporter::Init(exports);
  Metadata::Init(exports);
  // context::Init(exports);
  Event::Init(exports);
  Config::Init(exports);
}

NODE_MODULE(node_oboe, Init)
