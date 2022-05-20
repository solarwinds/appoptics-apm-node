#!/bin/bash

# user input as to what version they want to release
releasing="$1"

# for the name and version specified in package.json
pkg=$(node -e "console.log(require('./package.json').name)")
version=$(node -e "console.log(require('./package.json').version)")

# no match between user input and package.json - an error will halt workflow
if [ "$releasing" != "$version" ]; then
    echo "ERROR: can not trigger release."
    echo "Request to release: $releasing"
    echo "does not match: $version in package.json"
    exit 1 
fi

# the version being released is neither a full version or a prerelease one - an error will halt workflow
if [[ "$releasing" =~ - && ! "$releasing" =~ -prerelease. ]]; then
    echo "ERROR: $version not releasable."
    echo "released version must either be semver ({major}.{minor}.{patch})"
    echo "or have prerelease preid ({major}.{minor}.{patch}-prerelease.{pre})"
    exit 1 
fi

echo "Checking $version of $pkg."

npm view "$pkg" versions --json

# check if package version was already published
published=$(npm view "$pkg" versions --json | grep "\"$version\"")

# if it was published - an error will halt workflow
if [ "$published" != "" ]; then
    echo "ERROR: $published already published to NPM registry."
    exit 1 
fi
