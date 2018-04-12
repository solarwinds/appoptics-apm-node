Installing the oracle libraries to run the oracle DB tests.

Oracle requires the user to check a checkbox indicating
acceptance of the license terms in order to download the
instant client libraries and header files.

Those two files, instantclient-basiclite-linux.x64-12.2.0.1.0.zip
and instantclient-sdk-linux.x64-12.2.0.1.0.zip, should be downloaded
into this directory. They will be used by the docker-compose.yml
file to create the main container used for testing. The files are
required in order to build the oracledb package for testing.

Instructions within the container once the two zip files are available:

```
cd /opt/oracle
unzip instantclient-basic-linux.x64-12.2.0.1.0.zip
unzip instantclient-sdk-linux.x64-12.2.0.1.0.zip
mv instantclient_12_2 instantclient
cd instantclient
ln -s libclntsh.so.12.1 libclntsh.so
```

The library path needs to be modified, so:

`export LD_LIBRARY_PATH=/opt/oracle/instantclient:$LD_LIBRARY_PATH`

and if `libaio` isn't installed:

`apt-get install libaio1`


Full instructions here:

https://github.com/oracle/node-oracledb/blob/master/INSTALL.md#instzip

