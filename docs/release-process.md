# Release Process

## Overview

This *agent package* ([appoptics-apm](https://www.npmjs.com/package/appoptics-apm)) is dependent on the upstream *bindings package* ([@appoptics/apm-bindings](https://www.npmjs.com/package/@appoptics/apm-bindings)) which contains a binary node add-on. 

End users only install the *agent package*. They do not directly install the *bindings package*. 

Hence, any release of the binding package requires a release of the agent package. The agent package however can be released without a release of the bindings.

Both packages use a similar GitHub Actions driven Development & Release process.


## Prerelease Promotion 

Release of `prerelease` taged packages allows for robust end-to-end testing and offers end users simple access to next version features and fixes with minimal consequences. Packages maintainers may release as many prerelease versions as they deem appropriate.

### Bindings CheckList
1. On a branch, bump and tag prerelease version
  - ```npm version prerelease --preid alpha```
2. Push (watch result of triggered GitHub Actions workflow)
3. Create PR (watch result of triggered GitHub Actions workflow)
4. Merge (watch result of triggered GitHub Actions workflow)
5. If all workflows complete succsfully - Release
  - ```git push --tags```

### Agent
1. **ONLY IF needed** update bindings version to `prerelease`
  - ```npm install @appoptics/apm-bindings@prerelease```
  - ```git commit -am "Updated @appoptics/apm-bindings to prerelease."```
2. On a branch, bump and tag prerelease version
  - ```npm version prerelease --preid alpha```
3. Push (watch result of triggered GitHub Actions workflow)
4. Create PR (watch result of triggered GitHub Actions workflow)
4. Merge (watch result of triggered GitHub Actions workflow)
5. If all workflows complete succsfully - Release
  - ```git push --tags```
6. Watch result of Verify GitHub Actions workflow.

## Release Promotion

Release of `latest` tagged package versions is governed by SolarWinds and requires approval.

### Preparation CheckList

1. Request Final Review (FSR) from SolarWinds and recive approval.
2. Define what **version of the agent** will be released via what promotion (Major, Monor or Patch).
3. Ask admin to create a Jira Release named `agent-nodejs-X.Y.Z` and allocate relevant Jira issue tickets to it.
4. Create a [documentation ticket](https://swicloud.atlassian.net/wiki/spaces/CSS/pages/386760723/Documentation+Change+Process#Option-B%3A-Create-a-JIRA).

### Bindings

1. Create the release branch
  - ```git checkout -b Release```
2. Bump  and tag release version
  - ```npm version [<newversion> | major | minor | patch ]```
3. Push (watch result of triggered GitHub Actions workflow)
4. Create PR (watch result of triggered GitHub Actions workflow)
4. Merge (watch result of triggered GitHub Actions workflow)
5. Release
  - ```git push --tags```

### Agent
1. Create the release branch
  - ```git checkout Release```
2. Update bindings version **ONLY IF needed**
  - ```npm install @appoptics/apm-bindings@latest```
  - ```git commit -am "Updated @appoptics/apm-bindings to latest."```
2. Bump and tag prerelease version
  - ```npm version [<newversion> | major | minor | patch ]```
3. Push (watch result of triggered GitHub Action workflow)
4. Create PR (watch result of triggered GitHub Actions workflow)
4. Merge (watch result of triggered GitHub Actions workflow)
5. Release
  - ```git push --tags```
6. Watch Verify workflow result

### Post Release

TODO

