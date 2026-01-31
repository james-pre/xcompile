#!/bin/bash

# Credit: Dave Dopson, https://stackoverflow.com/a/246128/17637456
project_dir=$(dirname $( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd ))

set -euo pipefail

npx typedoc > /dev/null

npx cmake-js -d "$project_dir" clean
npx cmake-js -d "$project_dir" build

npx tsc -p "$project_dir/tsconfig.json"
chmod +x "$project_dir/dist/cli.js"

source "$project_dir/node.env"