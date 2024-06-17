# unraid-cron-jobs

## Project List

All projects read the `CRON_TIME` environment variable, falling back to a default value when unavailable.

| Name               | Description                                                            | Required env variables                                                 |
| ------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `scrape-cassettes` | Download all the cassettes at [tapedeck.org](http://www.tapedeck.org/) | `DESTINATION` - path where the files should be stored in the container |

## Organization

### Folders === image names

The `/src` folder will container dash-cased lowercase names for each Docker project.
These names will turn into an image pushed to Dockerhub in the format `qodesmith/project-name`.

### Each project...

Each project contains a `cronJob.ts` file. The build script will look for this
file to bundle it and the bundle will be used in the final Docker image.

_Dockerfiles are optional_. Since each project is a cron job and follows the
same basic rules, individual `Dockerfile`s aren't necessary. The
`Dockerfile.basic` file in the root directory is used for each project.

Should a project have particular needs, a `Dockerfile` can be specified in its
directory and will be used when building the image.

## Build

The build happens via `build.ts` at the root.

| npm script        | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `build.assets`    | Only build `.js` assets                                             |
| `build.all`       | Build `.js` assets and Docker images (no push to Dockerhub)         |
| `publishProjects` | Build `.js` assets, Docker images, and push everything to Dockerhub |

## Compose

The `docker-compose.yml` file is _only_ for running each project from Dockerhub.
It is not meant to build the projects.

The point is to build & push everything to Dockerhub first, then in unraid use a
single compose file to start all the projects, avoiding the need to install them
individually.
