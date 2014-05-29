#ifndef OBOE_REPORTERS_UDP_H
#define OBOE_REPORTERS_UDP_H

#include "../node-oboe.h"
#include "../context.h"
#include "../event.h"

using namespace v8;

class UdpReporter : public node::ObjectWrap {
  private:
    ~UdpReporter();

    oboe_reporter_t reporter;
    static Persistent<FunctionTemplate> constructor;
    static NAN_METHOD(New);
    static NAN_METHOD(sendReport);

  public:
    UdpReporter(const char*, const char*);
    static void Init(Handle<Object>);
};

#endif
