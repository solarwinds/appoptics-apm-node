#include "node-oboe.h"

namespace config {

using namespace v8;

NAN_METHOD(getRevision) {
  NanScope();
  NanReturnValue(NanNew<Number>(oboe_config_get_revision()));
}

NAN_METHOD(getVersion) {
  NanScope();
  NanReturnValue(NanNew<Number>(oboe_config_get_version()));
}

NAN_METHOD(checkVersion) {
  NanScope();

  if (args.Length() != 2) {
    return NanThrowError("Wrong number of arguments");
  }

  if (!args[0]->IsNumber() || !args[1]->IsNumber()) {
    return NanThrowError("Values must be numbers");
  }

  int version = args[0]->NumberValue();
  int revision = args[1]->NumberValue();

  bool status = oboe_config_check_version(version, revision) != 0;

  NanReturnValue(NanNew<Boolean>(status));
}

void Init(Handle<Object> exports) {
  NODE_SET_METHOD(exports, "getVersion", getVersion);
  NODE_SET_METHOD(exports, "getRevision", getRevision);
  NODE_SET_METHOD(exports, "checkVersion", checkVersion);
}

}  // namespace config
