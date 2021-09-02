# Development & Release with GitHub Actions 

> **tl;dr** Push to feature branch. Create Pull Request. Merge Pull Request. Push version tag to release.

## Overview

The package is dependent on the upstream package [@appoptics/apm-bindings](https://www.npmjs.com/package/@appoptics/apm-bindings) which contains a binary node add-on. 

End users do not directly install the upstream package. Hence, any release of the upstream package requires a release of this package. Versions however do not have to be synced and tere can be multiple releases of this package with same dependency on upstream package.

The upstream package uses a similar [Development & Release process](https://github.com/appoptics/appoptics-bindings-node#development--release-with-github-actions).

## Usage

### Prep - Push Dockerfile

* Push to master is disabled by branch protection.
* Push to branch which changes any Dockerfile in the `.github/docker-node/` directory will trigger [docker-node.yml](./workflows/docker-node.yml).
* Workflow will:
  - Build all Dockerfile and create a [single package](https://github.com/appoptics/appoptics-apm-node/pkgs/container/appoptics-apm-node%2Fnode-agent-runner) named `node-agent-runner` scoped to appoptics/appoptics-apm-node (the repo). The workflow is triggered by a push of a Dockerfile. Hence it has already ran successfully on commits in this Pull Request. Since this repo is public, the image is also public.
* Workflow creates (or recreates) image used in other workflows.
* Manual trigger supported.

```
push Dockerfile ─► ┌───────────────────┐ ─► ─► ─► ─► ─►
                   │Build Docker Images│ build & publish
manual ──────────► └───────────────────┘     
```

### Develop - Push

* Push to master is disabled by branch protection.
* Push to branch will trigger [push.yml](./workflows/push.yml). 
* Workflow will:
  - Run core tests on single node version set on the GitHub Actions runner. 
* Workflow confirms code is not "broken".
* Manual trigger supported. Enables to select node version to run on.
* Naming a branch with `-no-action` ending disables this workflow. Use for documentation branches edited via GitHub UI.
```
push to branch ──► ┌────────────────┐ 
                   │Single Core Test│ 
manual (image?) ─► └────────────────┘ 
```

### Review - Pull Request

* Creating a pull request will trigger [review.yml](./workflows/review.yml). 
* Workflow will:
  - Run full test suite on single node version inside a container linked to a network of service containers. 
* Workflow confirms code for probes work as expected.
* Manual trigger supported. Enables to select node version to run on.
```
pull request ────► ┌──────────────────────────┐
                   │Single Networked Full Test│
manual ──────────► └──────────────────────────┘
```
### Accept - Merge Pull Request 

* Merging a pull request will trigger [accept.yml](./workflows/accept.yml). 
* Workflow will:
  - Run full test suite on a matrix of node versions inside a container linked to a network of service containers. 
* Workflow confirms code for probes work as expected on all supported node versions.
* Manual trigger supported.
```

merge to master ─► ┌──────────────────────────┐
                   │Matrix Networked Full Test│
manual ──────────► └──────────────────────────┘
```

### Release - Push Version Tag

* Release process is `npm` and `git` triggered.
* To Release:
  1. On branch run `npm version {major/minor/patch}`(e.g. `npm version patch`) then have the branch pass through the Push/Pull/Merge flow above. 
  2. When ready `git push` origin {tag name} (e.g. `git push origin v11.2.3`).
* Pushing a semantic versioning tag for a patch/minor/major versions (e.g. `v11.2.3`) or an alpha tagged pre-release (e.g. `v11.2.3-alpha.2`) will trigger [release.yml](./workflows/release.yml). Pushing other pre-release tags (e.g. `v11.2.3-7`) is ignored.
* Workflow will: 
  - Publish an NPM package. When version tag is `alpha`, package will be NPM tagged same. When it is a release version, package will be NPM tagged `latest`.
* Workflow publishes.

```
push semver tag ─► ┌───────────┐
push alpha tag     │NPM Publish│
                   └───────────┘
```


### Verify - after Release

TODO

### Document - Manual

TODO

## Maintenance

> **tl;dr** There is no need to modify workflows. All data used is externalized.

### Definitions
* Local image is defined in [docker-node](./docker-node).
* [Target Group](./config/target-group.json) images include a wide variety of OS and Node version combinations. Group includes both images that can build from code as well as those which can not.

### Adding an image to GitHub Container Registry

1. Create a docker file with a unique name to be used as a tag. Common is to use: `{node-version}-{os-name-version}` (e.g `16-ubuntu20.04.2.Dockerfile`). If image is a build image suffix with `-build`.
2. Place a Docker file in the `docker-node` directory.
3. Due to [GitHub Action issues](https://github.com/actions/runner/issues/1202) Manual trigger of [docker-node.yml] is required.

### Modifying group lists

1. Find available tags at [Docker Hub](https://hub.docker.com/_/node) or use path of image published to GitHub Container Registry (e.g. `ghcr.io/$GITHUB_REPOSITORY/node:14-centos7`)
2. Add to appropriate group json file in `config`.

### Adding a Node Version

1. Create an `alpine` builder image and a `centos` builder image. Use previous node version Dockerfiles as guide.
2. Create `alpine`, `centos` and `amazonlinux2` test images. Use previous node version Dockerfiles as guide.
3. Follow "Adding an image to GitHub Container Registry" above.
4. Follow "Modifying group lists" above.

### Remove a node version

1. Remove version images from appropriate group json file in `config`.
2. Leave `docker-node` Dockerfiles for future reference.

## Implementation

> **tl;dr** No Actions used. Matrix and Container directive used throughout.

### Workflows

1. All workflows `runs-on: ubuntu-latest`.
2. For maintainability and security custom actions are avoided.
5. Since the scripts used are not a "formal" actions they are placed in a `script` directory.
3. The client/server duo used is not packaged as a "formal" action it and is thus placed in a `utils` directory.
3. All job steps are named.
5. Jobs are linked using `needs:`.

### Secrets

Repo is defined with the following secrets:
```
AO_TOKEN_PROD
AO_TOKEN_STG
NPM_AUTH_TOKEN
```