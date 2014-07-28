#!/bin/sh

{
  node-gyp rebuild
} || {
  echo "Error: Could not find the base liboboe libraries.  No tracing will occur."
  exit 0
}
