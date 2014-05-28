#ifndef OBOE_EVENT_H
#define OBOE_EVENT_H


#include "node-oboe.h"
#include "context.h"

using namespace v8;

class Event : public node::ObjectWrap {
  private:
    explicit Event();
    explicit Event(const oboe_metadata_t*, bool);
    ~Event();

    oboe_event_t event;
    static Persistent<FunctionTemplate> constructor;
    static NAN_METHOD(New);
    static NAN_METHOD(addInfo);
    static NAN_METHOD(addEdge);
    static NAN_METHOD(addEdgeStr);
    static NAN_METHOD(getMetadata);
    static NAN_METHOD(metadataString);
    static NAN_METHOD(startTrace);

  public:
    static void Init(Handle<Object>);
};

#endif
