# Release Process

## Overview

This *agent package* ([solarwinds-apm](https://www.npmjs.com/package/solarwinds-apm)) is dependent on the upstream *bindings package* ([solarwinds-apm-bindings](https://www.npmjs.com/package/solarwinds-apm-bindings)) which contains a binary node add-on. 

End users only install the *agent package*. They do not directly install the *bindings package*. 

Hence, any release of the binding package requires a release of the agent package. The agent package however can be released without a release of the bindings.

Both packages use a similar GitHub Actions driven Development & Release process.

## Prerelease Promotion 

Release of `prerelease` taged packages allows for robust end-to-end testing and offers end users simple access to next version features and fixes with minimal consequences. Packages maintainers may release as many prerelease versions as they deem appropriate.

### Bindings CheckList
1. Create a prerelease branch (e.g Prerelease-2021-09-22)
2. On the branch, bump and tag prerelease version with the `prerelease` tag.
  - ```npm version prerelease --preid prerelease```
3. Push (watch result of triggered GitHub Actions workflow)
4. Create PR (watch result of triggered GitHub Actions workflow)
5. Merge (watch result of triggered GitHub Actions workflow)
6. If all workflows complete successfully - Release (via Workflow)

### Agent
1. Create a prerelease branch (e.g Prerelease-2021-09-22)
2. **ONLY IF needed** update bindings version to `prerelease`
  - ```npm install solarwinds-apm-bindings@prerelease```
  - ```npm install --package-lock-only```
  - ```git commit -am "Updated solarwinds-apm-bindings to prerelease."```
3. On the branch, bump and tag prerelease version with the `prerelease` tag.
  - ```npm version prerelease --preid prerelease```
4. Push (watch result of triggered GitHub Actions workflow)
5. Create PR (watch result of triggered GitHub Actions workflow)
6. Merge (watch result of triggered GitHub Actions workflow)
7. If all workflows complete successfully - Release (via Workflow)
8. Watch result of Verify GitHub Actions workflow.

## Release Promotion

Release of `latest` tagged package versions is governed by SolarWinds and requires approval.

### Preparation CheckList

A release should **always** come after a prerelease. The head of the main branch should be the head of the released version.

1. Define what **version of the agent** will be released via what promotion (Major, Monor or Patch).
2. Ask admin to create a Jira Release named `agent-nodejs-X.Y.Z` and allocate relevant Jira issue tickets to it.
4. Create a request for Final Review (FSR) from SolarWinds Including:
  - Release Notes for Agent
  - Release Notes for Bindings (ONLY IF needed)
  - Link to Jira Release.
  - Link to GitHub Action Agent Prerelease Run
  - Link to Githb Action Bindings Prerelease Run (if needed).
  - Link to commits since last Agent release.
  - Link to commits since last Binding release (if needed).
  - Link to Checkmarx scan for Agent and review of any findings.
  - Link to Checkmarx scan for Bindings and review of any findings.
  - Link to Dependabot alerts for Agent and review of any.
  - Link for Dependabot alerts for Bindings and review of any.
5. Create a [documentation ticket](https://swicloud.atlassian.net/wiki/spaces/CSS/pages/386760723/Documentation+Change+Process#Option-B%3A-Create-a-JIRA).
6. Receive release approval. 

### Bindings

1. Create the release branch (note: must be linked to Jira ticket)
  - ```git checkout -b Release```
2. Bump  and tag release version
  - ```npm version [<newversion> | major | minor | patch ]```
3. Push (watch result of triggered GitHub Actions workflow)
4. Create PR (watch result of triggered GitHub Actions workflow)
5. Merge (watch result of triggered GitHub Actions workflow)
6. Update tags
  - ```git push --tags --dry-run``` to see what local tag is being pushed
  - ```git push --tags```
7. If all workflows complete successfully - Release (via Workflow)

### Agent
1. Create the release branch (note: must be linked to Jira ticket)
  - ```git checkout -b Release```
2. Update [CHANGELOG.md](https://github.com/solarwindscloud/solarwinds-apm-node/blob/main/CHANGELOG.md)
3. Update bindings version **ONLY IF needed**
  - ```npm install solarwinds-apm-bindings@latest```
  - ```npm install --package-lock-only```
  - ```git commit -am "Updated solarwinds-apm-bindings to latest."```
4. Bump and tag release version
  - ```npm version [<newversion> | major | minor | patch ]```
5. Push (watch result of triggered GitHub Action workflow)
6. Create PR (watch result of triggered GitHub Actions workflow)
7. Merge (watch result of triggered GitHub Actions workflow)
8. Update tags
  - ```git push --tags --dry-run``` to see what local tag is being pushed
  - ```git push --tags```
8. If all workflows complete successfully - Release (via Workflow)
9. Watch Verify workflow result

### Post Release
1. Update [Agent Release notes](https://github.com/solarwindscloud/solarwinds-apm-node/releases) and [Bindings Release Notes](https://github.com/solarwindscloud/solarwinds-bindings-node/releases). "Click Draft new release" and choose tag of completed release.
2. Run Document workflow.
3. Update Documentation Ticket with link to newly generated [supported components](https://github.com/solarwindscloud/solarwinds-apm-node/blob/main/docs/supported-components.human) list.
4. Announce new version in #ao-releases in Slack.
