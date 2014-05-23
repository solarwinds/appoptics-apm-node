#include "node-oboe.h"

// Components
#include "config.h"
#include "event.h"

// #if NODE_VER == 10
// # include "extras-v0-10.h"
// #elif NODE_VER == 12
// # include "extras-v0-12.h"
// #endif

namespace appneta {
namespace oboe {

void Init(v8::Handle<v8::Object> exports) {
#if NODE_VER == 10
  v8::Isolate* isolate = v8::Isolate::GetCurrent();
#elif NODE_VER == 12
  v8::Isolate* isolate = exports->CreationContext()->GetIsolate();
#endif

  config::Init(isolate, exports);
  Event::Init(isolate, exports);
}

// See https://github.com/joyent/node/pull/7240.  Need to make the module
// definition externally visible when compiling with -fvisibility=hidden.
// Doesn't apply to v0.11, it uses a constructor to register the module.
#if defined(__GNUC__) && NODE_VER == 10
extern "C" __attribute__((visibility("default")))
node::node_module_struct node_oboe_module;
#endif

NODE_MODULE(node_oboe, Init)

}  // namespace oboe
}  // namespace appneta
