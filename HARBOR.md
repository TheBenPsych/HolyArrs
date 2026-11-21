# Harbor

Harbor is a personal fork of [HolyArrs](https://github.com/HolyArrs/HolyArrs),
the one-app replacement for Sonarr, Radarr, Lidarr, Prowlarr, Bazarr and Seerr.
All credit for the original app goes to the HolyArrs project and its author.

Harbor keeps everything HolyArrs does and adds, over time:

- a new front door with five places: Today, Board, Explore, Shelves and Tower
- books, audiobooks and comics
- single-song and Soulseek music requests
- trailer files, an inspection step before a file lands, undo, a space planner
- a direct link to the Glowfin streaming app

## Licence

Harbor is released under the same licence as HolyArrs, the
[GNU AGPL-3.0](LICENSE). The source of every change is in this repository.
This file and the note at the top of the README are the notice that this
version has been changed from the original, starting 20 November 2026.

Harbor is not affiliated with or supported by the HolyArrs project. Please do
not ask the HolyArrs author for help with Harbor.

## How HolyArrs updates reach Harbor

Once a week the newest HolyArrs code is merged into Harbor. To keep those
merges clean, Harbor follows three rules:

1. **New things go in new files.** Harbor's pages, modules and workflows live
   in their own files and folders (named `harbor` where a name is needed).
2. **HolyArrs files are changed as little as possible.** When one must change,
   the change is kept to a few lines that hook in the Harbor code.
3. **Removed on purpose.** These HolyArrs files are deleted here and stay
   deleted when an update touches them: `.github/workflows/cla.yml`,
   `.github/workflows/scorecard.yml`, `.github/CODEOWNERS`. They only make
   sense in the original repository.

The HolyArrs release workflows (`release.yml`, `sign.yml`, `linux.yml`,
`synology.yml`) are left untouched and unused. They only start from a version
tag, and Harbor does not push version tags.

## Builds

`.github/workflows/harbor-image.yml` checks every pull request (image build,
`go build`, `go vet`) and builds every change on `main` into
`ghcr.io/thebenpsych/harbor:latest`. Nothing is published to Docker Hub.

## Install on Tower

`deploy/harbor/harbor-install.sh` installs Harbor on the Unraid server next to
the old apps. Paste this into the Unraid terminal (the `>_` icon, top right):

```sh
true; curl -fsSL https://raw.githubusercontent.com/TheBenPsych/HolyArrs/main/deploy/harbor/harbor-install.sh | bash ; true
```

It starts the container `harbor` on port 6262, gives it the media folder
read-only (watch-only mode, for the practice week) and hands Harbor the
addresses and keys of Radarr, Sonarr, Lidarr, Prowlarr, Bazarr and Seerr, so
**Settings > Import from other apps** can read them without typing. It only
looks at the old apps and never changes them. Running it again updates Harbor
and keeps its settings. `HARBOR_DRY=1` before `bash` shows what it would do
and changes nothing; `HARBOR_MODE=full` makes the media folder writable, for
the switch-over.

## Manga engine trial

`deploy/harbor/harbor-manga-trial.sh` starts Suwayomi (the community manga
engine Harbor's Manga lane will drive, build step 9) by itself on Tower, on
port 4567, so it can be tried before anything is built on top of it. It adds
no manga sources and touches nothing else. Paste into the Unraid terminal:

```sh
true; curl -fsSL https://raw.githubusercontent.com/TheBenPsych/HolyArrs/main/deploy/harbor/harbor-manga-trial.sh | bash ; true
```

Remove it again (settings and downloaded manga stay on disk):

```sh
true; docker rm -f harbor-manga-engine ; true
```
