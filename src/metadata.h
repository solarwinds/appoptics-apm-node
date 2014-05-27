#ifndef OBOE_METADATA_H
#define OBOE_METADATA_H

#include <node.h>

namespace appneta {
namespace nodoboe {

class Metadata : public node::ObjectWrap {
  friend class Event;

  private:
    explicit Metadata();
    explicit Metadata(oboe_metadata_t*);
    ~Metadata();

    oboe_metadata_t* metadata;
    static v8::Persistent<v8::FunctionTemplate> constructor;
    static NAN_METHOD(New);

  public:
    static void Init(v8::Handle<v8::Object>);
    oboe_metadata_t* getMetadata();
};

}  // namespace nodoboe
}  // namespace appneta

#endif
