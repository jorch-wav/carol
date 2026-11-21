#!/bin/bash
# Publish Carol to your GitHub and turn on GitHub Pages.
# Needs the GitHub CLI, logged in once:  sudo apt install gh  &&  gh auth login
# Usage: tools/publish.sh [repo-name]   (default: carol)
set -e
cd "$(dirname "$0")/.."
NAME=${1:-carol}
command -v gh >/dev/null || { echo "Install the GitHub CLI first:  sudo apt install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Log in first:  gh auth login"; exit 1; }
LOGIN=$(gh api user -q .login); ID=$(gh api user -q .id)
[ -d .git ] || git init -q -b main
# commit as your GitHub account (its private no-reply address)
git config user.name "$LOGIN"
git config user.email "$ID+$LOGIN@users.noreply.github.com"
git add -A
git diff --cached --quiet || git commit -q -m "Carol: bird synthesiser (Rust syrinx engine, WebAssembly, web app)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$NAME" --public --source . --remote origin --description "Carol: a bird synthesiser. Real bird voices from physical models of the syrinx, fitted to field recordings." --push
else
  git push -u origin main
fi
# GitHub Pages from the workflow in .github/workflows/pages.yml
gh api -X POST "repos/$LOGIN/$NAME/pages" -f build_type=workflow >/dev/null 2>&1 || gh api -X PUT "repos/$LOGIN/$NAME/pages" -f build_type=workflow >/dev/null 2>&1 || true
gh workflow run pages.yml -R "$LOGIN/$NAME" >/dev/null 2>&1 || true
echo
echo "Repo:  https://github.com/$LOGIN/$NAME"
echo "App:   https://$LOGIN.github.io/$NAME/   (ready in a minute or two, once the Pages workflow finishes)"
