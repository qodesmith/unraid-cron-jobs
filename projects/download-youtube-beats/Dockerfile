# All the projects use Bun to run a cron job. Each can override the base image
# with a `baseImage.txt` file.
ARG BASE_IMAGE=oven/bun:slim

# FROM ${BASE_IMAGE:-oven/bun:slim}
FROM $BASE_IMAGE

# Optional arg to specify packages to be installed.
ARG PACKAGES

RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg curl imagemagick

ARG PROJECT_NAME
ENV PROJECT_NAME=$PROJECT_NAME
ENV ROOT_DIR=/unraid-cron-jobs
RUN mkdir $ROOT_DIR

COPY ./common $ROOT_DIR/common/
COPY ./projects/$PROJECT_NAME $ROOT_DIR/projects/$PROJECT_NAME/

ARG PACKAGE_JSON
RUN echo "$PACKAGE_JSON" > $ROOT_DIR/projects/$PROJECT_NAME/package.json

WORKDIR $ROOT_DIR/projects/$PROJECT_NAME
RUN bun install

RUN mkdir /executables
WORKDIR /executables

# Download the nightly version of yt-dlp (has latest YouTube fixes) and add it to the path.
RUN curl -SLO https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp
RUN chmod +x yt-dlp
ENV PATH="$PATH:/executables"

# Install PO Token provider plugin to handle YouTube's SABR streaming authentication.
# See: https://github.com/yt-dlp/yt-dlp/issues/12482
RUN pip3 install --break-system-packages bgutil-ytdlp-pot-provider

# In order for dynamic values to be used for the last command, they must be env
# vars because this is evaluated & executed at run time, NOT build time.
CMD bun run $ROOT_DIR/projects/$PROJECT_NAME/cronJob.ts
