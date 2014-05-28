#ifndef OBOE_METADATA_H
#define OBOE_METADATA_H

#include "node-oboe.h"
#include <iostream>

using namespace v8;

class Metadata : public node::ObjectWrap {
  friend class Event;

  private:
    ~Metadata();

    oboe_metadata_t metadata;
    static Persistent<FunctionTemplate> constructor;
    static NAN_METHOD(New);
    static NAN_METHOD(fromString);
    static NAN_METHOD(makeRandom);
    static NAN_METHOD(copy);
    static NAN_METHOD(isValid);
    static NAN_METHOD(toString);
    static NAN_METHOD(createEvent);

  public:
    Metadata();
    Metadata(oboe_metadata_t*);
    static void Init(Handle<Object>);
};

#endif
