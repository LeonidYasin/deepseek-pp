#!/bin/bash

echo "Fetching latest failed builds..."
echo

# List recent runs
echo "Recent builds:"
gh run list --limit 10 --json databaseId,status,conclusion,name,displayTitle | jq '.[] | "\(.databaseId): \(.status)/\(.conclusion) - \(.displayTitle)"'

echo
echo "========================================"
echo "Errors from failed builds:"
echo "========================================"

# Get failed runs and show errors
for run in $(gh run list --limit 5 --status failure --json databaseId --jq '.[].databaseId'); do
    echo
    echo "--- Run $run ---"
    gh run view $run --log 2>&1 | grep -i -E "error|fail|exception" | head -20
done

echo
echo "Done!"
