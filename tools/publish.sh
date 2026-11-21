#!/bin/bash
# Publish Carol to your GitHub and turn on GitHub Pages.
# Needs the GitHub CLI, logged in once:  sudo apt install gh  &&  gh auth login
# Usage: [MSG='what changed'] tools/publish.sh [repo-name]   (default: carol)
set -e
cd "$(dirname "$0")/.."
NAME=${1:-carol}
command -v gh >/dev/null || { echo "Install the GitHub CLI first:  sudo apt install gh"; exit 1; }
# hand gh its saved login directly, so it never asks the desktop keyring (which is locked after an
# auto-login and pops up an "Unlock Keyring" password box on the Pi's screen)
[ -z "$GH_TOKEN" ] && GH_TOKEN=$(sed -n 's/^ *oauth_token: *//p' ~/.config/gh/hosts.yml 2>/dev/null | head -1) && export GH_TOKEN
gh auth status >/dev/null 2>&1 || { echo "Log in first:  gh auth login"; exit 1; }
LOGIN=$(gh api user -q .login); ID=$(gh api user -q .id)
[ -d .git ] || git init -q -b main
# commit as your GitHub account (its private no-reply address)
git config user.name "$LOGIN"
git config user.email "$ID+$LOGIN@users.noreply.github.com"
git add -A
git diff --cached --quiet || git commit -q -m "${MSG:-Update Carol}

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$NAME" --public --source . --remote origin --description "Carol: a bird synthesiser. Real bird voices from physical models of the syrinx, fitted to field recordings." --push
else
  git push -u origin main
fi
# the site: web/ as the gh-pages branch, which GitHub Pages serves (no workflow needed)
git branch -D gh-pages >/dev/null 2>&1 || true
git subtree split --prefix web -b gh-pages >/dev/null
git push -f origin gh-pages
gh api -X POST "repos/$LOGIN/$NAME/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 || \
  gh api -X PUT "repos/$LOGIN/$NAME/pages" -f build_type=legacy -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 || true
echo
echo "Repo:  https://github.com/$LOGIN/$NAME"
echo "App:   https://$LOGIN.github.io/$NAME/   (updates in a minute or two)"
