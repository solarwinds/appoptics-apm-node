#include "node-oboe.h"

namespace appneta {
  namespace oboe {
    namespace config {

      using namespace v8;

      Handle<Value> getRevision(const Arguments& args) {
        HandleScope scope;
        return scope.Close(Number::New(oboe_config_get_revision()));
      }

      void Init(Isolate* isolate, Handle<Object> exports) {
        exports->Set(
          String::NewSymbol("getRevision"),
          FunctionTemplate::New(getRevision)->GetFunction()
        );
      }

    }  // namespace config
  }  // namespace oboe
}  // namespace appneta
