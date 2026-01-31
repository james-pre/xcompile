#!/bin/bash

set -euo pipefail

npx typedoc > /dev/null

cmake-js clean
cmake-js build

npx tsc -p tsconfig.json
chmod +x dist/cli.js
