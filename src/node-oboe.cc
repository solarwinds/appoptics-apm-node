#include "node-oboe.h"

// Components
#include "metadata.h"
#include "context.h"
#include "config.h"
#include "event.h"

namespace appneta {
namespace nodoboe {

using v8::Handle;
using v8::Object;

void Init(Handle<Object> exports) {
  config::Init(exports);
  Event::Init(exports);
}

NODE_MODULE(node_oboe, Init)

}  // namespace nodoboe
}  // namespace appneta
