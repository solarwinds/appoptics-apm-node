#!/bin/bash

# script used to clone main repo into dev repo.
# trigger via npm run.
# no other usage.
# always WIP.

name="appoptics-apm-node"

if [ -f /.dockerenv ]; then 
  echo "Do not run from inside a container."
  exit 
fi

dev_name="${name}-dev"

# for the current branch - make sure name and S3 are setup to dev.
init_branch() {
  node  "../${name}/dev/repo/package-patch.js" > __package.json
  mv __package.json package.json
  git commit -am "dev init !"
}

## reset remote repo
git push -f dev --all
git push dev --tags

# clone clone a fresh one
cd ../ || exit
rm -rf "${dev_name}"
git clone "git@github.com:appoptics/${dev_name}.git"

cp "${name}/.env" "${dev_name}/.env"
cd "${dev_name}" || exit
init_branch

# Track all remote branches
# https://stackoverflow.com/questions/67699/how-to-clone-all-remote-branches-in-git/4754797#4754797 + modified
for branch in $(git branch --all | grep '^\s*remotes' | grep -E --invert-match '(:?HEAD|master)$'); do
    git branch --track "${branch##*/}" "$branch"
done

# init each to dev
# https://stackoverflow.com/a/36510925 modified
for branch in .git/refs/heads/*; do
  b=${branch#".git/refs/heads/"}
  git checkout "$b"
  init_branch
done

git push --all origin
