#ifndef OBOE_EVENT_H
#define OBOE_EVENT_H

#include <cstring>

namespace appneta {
namespace nodoboe {

class Event : public node::ObjectWrap {
  private:
    explicit Event();
    explicit Event(const oboe_metadata_t*, bool);
    ~Event();

    oboe_event_t* event;
    static v8::Persistent<v8::FunctionTemplate> constructor;
    static NAN_METHOD(New);
    static NAN_METHOD(addInfo);
    static NAN_METHOD(addEdge);
    static NAN_METHOD(addEdgeStr);

  public:
    static void Init(v8::Handle<v8::Object>);
};

}  // namespace nodoboe
}  // namespace appneta

#endif
