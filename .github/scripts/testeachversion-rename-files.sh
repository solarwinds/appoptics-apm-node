#!/bin/bash

workdir="$1"
node="$2"
pkg="${3////_}" # remove any / from package name (scoped packages have that)

# clean : to allow file upload
for fn in "$workdir"/*":"*; do
  mv -- "$fn" "${fn//:/_}"; 
done

# add package & node prefix to test results file name
fn=$(ls "$workdir"/*Z)
mv "$fn" "$workdir"/"$node"-"$pkg"-"$(basename -- "$fn")".raw

# add package & node prefix to summary file name
fn=$(ls "$workdir"/*.json)
mv "$fn" "$workdir"/"$node"-"$pkg"-"$(basename -- "$fn" .json)".json

# some output
ls "$workdir"
