# Mongo Replica Set


### On Docker Hub

This image is hosted on Docker Hub [here](https://hub.docker.com/r/traceqa/mongo-set/). It can be pulled using `# docker pull traceqa/mongo-set`.

### History

This is derived from the previous version of these files on Docker Hub [here](https://hub.docker.com/r/traceqa/mongo/) which still can be pulled using `# docker pull traceqa/mongo:set`.

That version was derived from [nickstenning's github repo](https://github.com/nickstenning/dockerfiles/tree/master/mongodb).

### Modifications

Current version `traceqa/mongo-set`
* this is not yet integrated into the Jenkins startup for Docker Services, nor the doc files[here](https://github.com/librato/trace/blob/master/docs/archived/testing/Docker-Services.md) and [here](https://github.com/librato/trace/blob/master/docs/archived/testing/Supporting-Services-for-Testing.md).
* I currently manually start this using the run command below.
* It was built using `docker build . -t mongo-set`
* It was published using `docker push traceqa/mongo-set` with credentials that have access to the traceqa organization.


Changes to `traceqa/mongo:set`:
* Accepts env var REPLSETHOST for the host name (default `localhost`).
* Uses ports 30001+ and requires that the correct number of ports are mapped in the `docker run` command.
  - `docker run -d -p 30001:30001 -p 30002:30002 -p 30003:30003 mongo-set`

Between when the original changes were made and when I started testing there were apparently some changes to the way mongodb-core worked. The net is that both the client and the host must be able to access members of the replica set using the hostnames and ports provided in the `rs.initiate(config)` call. `traceqa/mongo:set` used `localhost` to build the containers but the client cannot access them using `localhost`. (Even though the client specifies the hosts as being `ec2-52-7-124-5.compute-1.amazonaws.com` once mongodb-core has opened the databases it tells the client the hostname `localhost` to use causing the client access to fail.)


Changes to nickstenning's original version:
* builds on ubuntu 14.04 rather than 12.04
* installs mongo 3.07 rather than 2.6
* removed unused code from start script and added comments
* mongod configured with nsSize 8M (rather than default 16M), and durability journal disabled, for faster startup
* updated supervisord config files so that the mongod processes run first
* use connection check rather than sleep prior to replica set initiation
* call rs.status() at the end of replica set initiation

It looks like mongod's preallocation of the durability journal (and data and namespace files to a lesser extent) can take up to several minutes on initial start, this is the "Preallocation Lag" mentioned in their [docs](https://docs.mongodb.org/v3.0/core/journaling/).  For now the journal is disabled to avoid the lag but if it needs to be enabled, should follow [these steps](https://docs.mongodb.org/v3.0/tutorial/manage-journaling/#journaling-avoid-preallocation-lag) to avoid the lag.

### Make Changes and Push to Docker Hub

The image used by the Docker services instance is not built each time from these files. It is pulled from the Docker Hub. If you make any changes in this directory you must push to Docker Hub before the changes are felt by our automated tests.

If you want to make changes to this image...

1. Modify the files in this location as required
2. Build the image using `# docker build -t traceqa/mongo-set .`
3. Make sure you're signed into your Docker Hub account with `# docker login --username=<your username>`
   *You must have your own Docker Hub account and be a member of the [traceqa organization](https://hub.docker.com/u/traceqa/)*
4. Push to Docker Hub with `# docker push traceqa/mongo-set`
5. Check the [Docker Hub page](https://hub.docker.com/r/traceqa/mongo/) to confirm a successful push. Under the title, you should see "Last pushed: A few seconds ago"

### Current Configuration
As of *September 17 2018*, the image uses Ubuntu 14.04 and Docker 3.0.7. If any changes are necessary follow the instructions above to update the image on Docker Hub.
