#include "node-oboe.h"

namespace appneta {
  namespace oboe {
    namespace config {

      using namespace v8;

      Handle<Value> getRevision(const Arguments& args) {
        HandleScope scope;
        return scope.Close(Number::New(oboe_config_get_revision()));
      }

      Handle<Value> getVersion(const Arguments& args) {
        HandleScope scope;
        return scope.Close(Number::New(oboe_config_get_version()));
      }

      Handle<Value> checkVersion(const Arguments& args) {
        HandleScope scope;

        if (args.Length() != 2) {
          ThrowException(Exception::TypeError(String::New("Wrong number of arguments")));
          return scope.Close(Undefined());
        }

        if (!args[0]->IsNumber() || !args[1]->IsNumber()) {
          ThrowException(Exception::TypeError(String::New("Values must be numbers")));
          return scope.Close(Undefined());
        }

        int version = args[0]->NumberValue();
        int revision = args[1]->NumberValue();

        bool status = oboe_config_check_version(version, revision) != 0;

        return scope.Close(Boolean::New(status));
      }

      void Init(Isolate* isolate, Handle<Object> exports) {
        exports->Set(
          String::NewSymbol("getRevision"),
          FunctionTemplate::New(getRevision)->GetFunction()
        );
        exports->Set(
          String::NewSymbol("getVersion"),
          FunctionTemplate::New(getVersion)->GetFunction()
        );
        exports->Set(
          String::NewSymbol("checkVersion"),
          FunctionTemplate::New(checkVersion)->GetFunction()
        );
      }

    }  // namespace config
  }  // namespace oboe
}  // namespace appneta
