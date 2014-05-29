#include "node-oboe.h"

// Components
#include "reporters/udp.h"
#include "metadata.h"
#include "context.h"
#include "config.h"
#include "event.h"

using v8::Handle;
using v8::Object;

// Register the exposed parts of the module
void Init(Handle<Object> exports) {
	NanScope();

  Metadata::Init(exports);
  // context::Init(exports);
  Event::Init(exports);
  config::Init(exports);
}

NODE_MODULE(node_oboe, Init)
