# How one deployment serves seven hostnames

This file holds the reasoning that used to sit inside `vercel.json` as a
`_comment` key. It had to move: `vercel.json` is schema-validated, the schema
forbids unknown properties, and a deployment carrying `_comment` fails with

    The `vercel.json` schema validation failed with the following message:
    should NOT have additional property `_comment`

JSON has no comments. The configuration is next door; the explanation is here.

## ONE Vercel project serves all seven hostnames

The rewrite in `vercel.json` is what makes the architecture work. Every path
that is not a real file is served `index.html`, so a detail route like
`/learn/floor` or `/release/origin-echo` resolves without a generated page per
record. Automatic publishing depends on it: when House of Assets approves a
record, its detail route must already work.

The negative lookahead keeps real assets out of the rewrite. Without it
`/engine/boot.js` would be served `index.html` and the module would fail on a
`text/html` MIME type — which is exactly what happened in testing before the
asset paths were made root-absolute.

Identity comes from the REQUEST HOSTNAME at runtime (`engine/router.js`), so no
per-domain configuration is needed and the seven cannot drift apart. Adding a
hostname is a domain attached to this project plus a DNS record — no code
change and no second deployment.

## Root Directory

The Vercel project's Root Directory must be `platform`. The repository root is
the separate Jekyll institutional site; if Root Directory is unset, the project
serves that instead, Liquid templates and all, and `vercel.json` here is never
read.
