# Release publishing

Pushing a version tag such as `v0.0.2` runs the tests, creates a GitHub release with `module.json` and `module.zip`, then publishes that version to Foundry's package directory. Publishing an existing GitHub release also runs the workflow. Prereleases are not submitted to Foundry.

## One-time Foundry setup

1. Register Shifting Faces on the Foundry website and obtain approval for its package listing.
2. Copy its **Package Release Token** from the package edit page.
3. In this GitHub repository, open **Settings → Secrets and variables → Actions** and create the repository secret **FOUNDRYVTT_RELEASE_TOKEN** with that token.

The token must belong to the `shifting-faces` package. Without the secret, GitHub releases still work and Foundry publishing is skipped with a warning.

To publish an existing version after setup, open **Actions → Publish Foundry Module → Run workflow**, select `main`, and enter its tag (for example `v0.0.1`). The workflow uses the selected tag's files and refreshes the release assets before submitting them. Use this after fixing a failed publication as well.

The publisher receives the version-specific manifest URL, release notes URL, and compatibility values from the generated manifest. The manifest's update URL continues to point to the latest GitHub release.

Action documentation: https://github.com/marketplace/actions/foundryvtt-publish-package-action
