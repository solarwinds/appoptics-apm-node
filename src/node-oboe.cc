#include "node-oboe.h"

// Components
#include "metadata.h"
#include "context.h"
#include "config.h"
#include "event.h"

using v8::Handle;
using v8::Object;

void Init(Handle<Object> exports) {
	NanScope();

  Metadata::Init(exports);
  // context::Init(exports);
  Event::Init(exports);
  config::Init(exports);

	// Initialize oboe
	oboe_init();
}

NODE_MODULE(node_oboe, Init)
