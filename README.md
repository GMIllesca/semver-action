# Overview

GitHub Action to bump semantic versioning based on releases or tags


## Usage

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: version
        id: version
        uses: flatherskevin/semver-action@v1
        with:
          source: tags
      - name: Release
        uses: softprops/action-gh-release@v1
        with:
          name: ${{ steps.version.outputs.nextVersion }}
          tag_name: ${{ steps.version.outputs.nextVersion }}
```
