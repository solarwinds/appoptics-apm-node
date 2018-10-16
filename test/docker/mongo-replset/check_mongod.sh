#/usr/bin/env bash
# check ability to connect to the mongod running at CHECK_PORTS
# returns true if can connect to all, else returns false

ports=${CHECK_PORTS:=30001 30002 30003}
attempts=360
success=false
for ((i=0; i < $attempts; i++)) ; do
    ok=
    for port in $ports ; do
        if mongo localhost:${port} --eval '0' ; then
            ok="${ok} $port"
        fi
    done
    echo "PORTS:${ports}, OK:${ok}"
    if [ "${ok# }" = "${ports# }" ] ; then
        success=true
        break
    fi
    echo waiting for all mongod to be running...
    sleep 1
done
$success
