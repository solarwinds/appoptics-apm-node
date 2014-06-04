#ifndef OBOE_CONFIG_H
#define OBOE_CONFIG_H

#include "node-oboe.h"

using namespace v8;

NAN_METHOD(Config::getRevision) {
  NanScope();
  NanReturnValue(NanNew<Number>(oboe_config_get_revision()));
}

NAN_METHOD(Config::getVersion) {
  NanScope();
  NanReturnValue(NanNew<Number>(oboe_config_get_version()));
}

NAN_METHOD(Config::checkVersion) {
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

void Config::Init(Handle<Object> module) {
  NanScope();

  Local<Object> exports = NanNew<Object>();
  NODE_SET_METHOD(exports, "getVersion", Config::getVersion);
  NODE_SET_METHOD(exports, "getRevision", Config::getRevision);
  NODE_SET_METHOD(exports, "checkVersion", Config::checkVersion);

  module->Set(NanNew<String>("Config"), exports);
}

#endif
