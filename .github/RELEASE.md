# Release Workflow

## Daily Development

```bash
git add src/
git commit -m "fix: ..."
git push origin master
```

## Release a New Version (e.g. 1.0.4)

```bash
# 1. Bump version (automatically updates package.json / manifest.json / versions.json and creates a commit)
pnpm version 1.0.4

# 2. Push the commit
git push origin master

# 3. Push the tag (triggers GitHub Actions to build and create the Release)
git tag 1.0.4
git push origin 1.0.4
```

The Release workflow only triggers when you push the tag in step 3.

## What GitHub Actions Does Automatically

1. Checkout master branch
2. pnpm install + pnpm build
3. Generate artifact attestations (cryptographic signatures) for main.js, styles.css, manifest.json
4. Create a GitHub Release and upload assets
5. Generate release notes automatically based on commit messages

## Notes

- Tag name must NOT have a `v` prefix. It must match the version in manifest.json exactly (e.g. `1.0.4`)
- `.npmrc` has `git-tag-version=false`, so `pnpm version` will not create a git tag automatically
- Use conventional commit prefixes for better auto-generated release notes:
  - `feat:` new feature
  - `fix:` bug fix
  - `chore:` maintenance
  - `docs:` documentation
