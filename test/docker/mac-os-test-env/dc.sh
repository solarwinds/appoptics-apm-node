#!/usr/bin/env bash

action=$1

case $action in
    config)
	docker-compose config
	;;
    ps)
	docker-compose ps
	;;
	test)
	docker-compose down -v --remove-orphans
	docker-compose run --service-ports --rm --name node_main node_main test/docker/MacOS_test_env/start.sh
	;;
    down)
	docker-compose down -v --remove-orphans
	;;
	logs)
	docker-compose logs -f
	;;
    *)
	docker-compose down -v --remove-orphans
	docker-compose run --service-ports --rm --name node_main node_main start.sh
	;;
esac
