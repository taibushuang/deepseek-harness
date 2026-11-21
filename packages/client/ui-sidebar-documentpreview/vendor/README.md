# vendor/

`xlsx-0.20.3.tgz` is the pinned SheetJS build that upstream resolves from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.

That CDN is effectively unusable from mainland China network paths: a single connection stalls after roughly 200 KB and every retry restarts from zero. This fork installs the package from the checked-in tarball instead; its bytes and `sha512` integrity match the upstream resolution exactly. Upstream syncs keep this fork-local override.
