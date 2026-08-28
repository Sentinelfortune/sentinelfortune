#!/usr/bin/env bash
# Build the site for a ROOT-SERVED preview host (Vercel), into ./_site.
#
# WHY THIS EXISTS
# ---------------
# The published site lives in a subdirectory on GitHub Pages
# (baseurl: /sentinelfortune). A preview host serves from the domain root, so
# the ordinary build is broken there: every stylesheet and every internal link
# resolves to /sentinelfortune/... and 404s. Measured, not assumed — the
# Academy page returns HTTP 200 with all 27 of its links dead.
#
# _config.preview.yml is the overlay that fixes it, and it also keeps canonical
# tags pointing at the real production address so a preview can never compete
# with production in a search index.
#
# _config.yml is NOT modified. The GitHub Pages build is unaffected by
# anything here.
#
# USAGE
#   ./scripts/build-preview.sh          # writes ./_site
#   npx vercel deploy _site --yes       # deploy that directory as a Preview
#
# Deploying ./_site as a plain static directory is deliberate: it does not
# depend on the preview host having Ruby, Bundler or a Jekyll toolchain, so
# the build that was validated locally is byte-for-byte the build that ships.

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v jekyll >/dev/null 2>&1; then
  echo "error: jekyll not on PATH. Install it (gem install jekyll) and retry." >&2
  exit 1
fi

rm -rf _site
jekyll build --config _config.yml,_config.preview.yml -d _site

# Security headers for the deployed preview. Written into the output rather
# than committed at the repository root, so it applies to this static deploy
# and cannot be mistaken for configuration of the GitHub Pages site.
#
# No connect-src restriction beyond 'self': the homepage fetches
# /data/broadcast.json, and Google Fonts is loaded from the document.
cat > _site/vercel.json <<'JSON'
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" }
      ]
    }
  ]
}
JSON

echo
echo "Built ./_site for a root-served preview host."
echo "  routes:  $(find _site -name '*.html' | wc -l | tr -d ' ')"
echo "  next:    npx vercel deploy _site --yes"
