# unraid-cron-jobs

## Project List

| Name                     | Custom Dockerfile | Description                                                            |
| ------------------------ | :---------------: | ---------------------------------------------------------------------- |
| `scrape-cassettes`       |                   | Download all the cassettes at [tapedeck.org](http://www.tapedeck.org/) |
| `prune-notion-backups `  |                   | Keep only `n` number of Notion backups                                 |
| `download-youtube-beats` |        ✅         | Download beats from the YouTube playlist                               |
| `backup-github`          |                   | Archive all Github repos                                               |

## Env Vars

### Universal Env Vars

| Env variable  | Description                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------- |
| `CRON_TIME`   | Sets the cron time value. Each project will also have it's own default value to fall back on. |
| `DESTINATION` | path where data (if applicable) are stored in the container.                                  |

### Project-Specific Env Vars

These env vars should be set in [docker-compose.yml](./docker-compose.yml).

See the [dl-yt-playlist](https://github.com/qodesmith/dl-yt-playlist?tab=readme-ov-file#usage) docs for details on the `download-youtube-beats` env variables.

| Project                     | Env variable                 | Description                                                                               |
| --------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `prune-notion-backups`      | `BACKUP_LIMIT`               | _(optional)_ Max number of backups to keep (defaults to 4)                                |
| `backup-github`             | `GIT_CONFIG_GLOBAL`          | `/gitconfig/.gitconfig` - location to the global git config (for git versions >= 2.34)    |
|                             | `GIT_CONFIG`                 | `/gitconfig/.gitconfig` - location to the global git config (for git versions < 2.34)     |
| `download-youtube-playlist` | `FETCHNOW_QUERY_KEY`         | Read from a `.env` file on the Unraid server - enables manually triggering a cron job run |
|                             | `FETCHNOW_QUERY_VALUE`       | Read from a `.env` file on the Unraid server - enables manually triggering a cron job run |
|                             | `BEATS_CRON_CONTAINER_NAME`  | Read from a `.env` file on the Unraid server - enables manually triggering a cron job run |
|                             | `BEATS_CRON_CONTAINER_PORT`  | Read from a `.env` file on the Unraid server - enables manually triggering a cron job run |
|                             | `PLAYLIST_ID`                | Read from a `.env` file on the Unraid server                                              |
|                             | `YOUTUBE_API_KEY`            | Read from a `.env` file on the Unraid server                                              |
|                             | `DOWNLOAD_TYPE`              | Type of file to download                                                                  |
|                             | `AUDIO_FORMAT`               | _(optional)_                                                                              |
|                             | `VIDEO_FORMAT`               | _(optional)_                                                                              |
|                             | `DOWNLOAD_THUMBNAILS`        | _(optional)_                                                                              |
|                             | `MAX_DURATION_SECONDS`       | _(optional)_                                                                              |
|                             | `MOST_RECENT_ITEMS_COUNT`    | _(optional)_                                                                              |
|                             | `SILENT`                     | _(optional)_                                                                              |
|                             | `MAX_CONCURRENT_FETCH_CALLS` | _(optional)_                                                                              |
|                             | `MAX_CONCURRENT_YTDLP_CALLS` | _(optional)_                                                                              |
|                             | `SAVE_RAW_RESPONSES`         | _(optional)_                                                                              |

## Organization

### Folders === image names

The `/projects` folder will contain _dash-cased_ lowercase names for each Docker
project. These names will turn into an image pushed to Dockerhub in the format
`qodesmith/<project-name>`.

### Each project...

#### `cronJob.ts`

Each project contains a `cronJob.ts` entrypoint file.

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

## Build

The build happens via `build.ts` at the root.

| npm script             | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `build.all`            | Build Docker images for _Unraid_ without pushing to Dockerhub               |
| `build.all.local`      | Build Docker images for the local environment without pushing to Dockerhub  |
| `publishProjects`      | Build Docker images for _Unraid_ and push everything to Dockerhub           |
| `publishSingleProject` | Build a single project's Docker image for _Unraid_ and push it to Dockerhub |

## Compose

The `docker-compose.yml` file is _only_ for running each project in Unraid. It
is not meant to build the projects.

The point is to build & push everything to Dockerhub first, then in Unraid use a
single compose file to start all the projects, avoiding the need to install them
individually.

### Updating the containers in Unraid

Regardless of if a single project or all projects were built, the Docker Compose
plugin in Unraid will know to pull only the images that have changed.

Simply click the "Update Stack" button. All containers will be restarted.
