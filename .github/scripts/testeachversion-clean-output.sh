#!/bin/bash

path_to_file="$1"

# remove excessive test data header
sed -i '/^appoptics-apm/d' "$path_to_file"
sed -i '/^ appoptics-apm/d' "$path_to_file"
sed -i '/^ node v/d' "$path_to_file"

# remove excessive labeling
sed -i '/^packages:/d' "$path_to_file"

# remove all white space
sed -i '/^$/d' "$path_to_file"
