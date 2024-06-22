# unraid-cron-jobs

## Project List

| Name                     | Custom Dockerfile | Description                                                            |
| ------------------------ | :---------------: | ---------------------------------------------------------------------- |
| `scrape-cassettes`       |                   | Download all the cassettes at [tapedeck.org](http://www.tapedeck.org/) |
| `prune-notion-backups `  |                   | Keep only `n` number of Notion backups                                 |
| `download-youtube-beats` |        ✅         | Download beats from the YouTube playlist                               |

### Universal Env Vars

| Env variable        | Description                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `CRON_TIME`         | Sets the cron time value. Each project will also have it's own default value to fall back on.                               |
| `DESTINATION`       | path where data (if applicable) are stored in the container.                                                                |
| `DELAY_INITIAL_RUN` | A value in milliseconds to delay running the project. This is helpful to avoid each project from starting at the same time. |
| `HANDLE_JOB_ARG`    | A `JSON.stringify`'d object that will be passed to the project's `handleJob` function as its only argument.                 |

### Project-Specific Env Vars

See the [dl-yt-playlist](https://github.com/qodesmith/dl-yt-playlist?tab=readme-ov-file#usage) docs for details on the `download-youtube-beats` env variables.

| Project                  | Env variable                 | Description                                                                           |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------- |
| `prune-notion-backups`   | `BACKUP_LIMIT`               | _(optional)_ Max number of backups to keep (defaults to 4)                            |
| `download-youtube-beats` | `HANDLE_JOB_ARG`             | `{isFullRun: true}` - instructs the initial run job to download the full set of beats |
|                          | `PLAYLIST_ID`                | Read from a `.env` file on the Unraid server                                          |
|                          | `YOUTUBE_API_KEY`            | Read from a `.env` file on the Unraid server                                          |
|                          | `DOWNLOAD_TYPE`              | Type of file to download                                                              |
|                          | `AUDIO_FORMAT`               | _(optional)_                                                                          |
|                          | `VIDEO_FORMAT`               | _(optional)_                                                                          |
|                          | `DOWNLOAD_THUMBNAILS`        | _(optional)_                                                                          |
|                          | `MAX_DURATION_SECONDS`       | _(optional)_                                                                          |
|                          | `MOST_RECENT_ITEMS_COUNT`    | _(optional)_                                                                          |
|                          | `SILENT`                     | _(optional)_                                                                          |
|                          | `MAX_CONCURRENT_FETCH_CALLS` | _(optional)_                                                                          |
|                          | `MAX_CONCURRENT_YTDLP_CALLS` | _(optional)_                                                                          |
|                          | `SAVE_RAW_RESPONSES`         | _(optional)_                                                                          |

## Organization

### Folders === image names

The `/projects` folder will contain _dash-cased_ lowercase names for each Docker
project. These names will turn into an image pushed to Dockerhub in the format
`qodesmith/<project-name>`. The folder name will also be used to create the
final `.js` assets in the build step.

### Each project...

#### `cronJob.ts`

Each project contains a `cronJob.ts` file. The build script will look for this
file to bundle it and the bundle will be used in the final Docker image.

#### Dockerfiles are optional

Since each project is a cron job and follows the same basic rules, individual
`Dockerfile`s aren't necessary. The `Dockerfile.basic` file in the root
directory is used for each project.

Should a project have particular needs, a `Dockerfile` can be created in its
directory and will be used when building the image.

#### `dockerfileArgs.json`

Each project can specify `ARG`s that will be dynamically added to the Docker
build with this file. Keys and values will turn into:

```
--build-arg <key>=<value>
```

### Entrypoint - `entry.js`

This is the entrypoint to each project. This file is copied into each project's
container when building the Docker image. It will:

- Import `app.js` (each project is bundled into this file) and import the
  `handleJob` function
- Read `HANDLE_JOB_ARG` env variable, parses it, and passes it as the only
  argument to `handleJob`
- Delay executing `handleJob` via the `DELAY_INITIAL_RUN` env variable

## Build

The build happens via `build.ts` at the root.

| npm script        | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `build.assets`    | Only build `.js` assets                                             |
| `build.all`       | Build `.js` assets and Docker images (no push to Dockerhub)         |
| `publishProjects` | Build `.js` assets, Docker images, and push everything to Dockerhub |

### General build process

- `/projects/example-project` - project root directory
- Build a `example-project.js` asset using `cronJob.ts` as the entrypoint and
  save it in the `dist` folder
- Use the `Dockerfile` in the project folder or `Dockerfile.basic` to build the
  project's image
- During the docker build process:
  - Copy `example-project.js` to the image as `app.js`
  - Copy `entry.js` to the image
  - Run `entry.js`

## Compose

The `docker-compose.yml` file is _only_ for running each project from Dockerhub.
It is not meant to build the projects.

The point is to build & push everything to Dockerhub first, then in unraid use a
single compose file to start all the projects, avoiding the need to install them
individually.
