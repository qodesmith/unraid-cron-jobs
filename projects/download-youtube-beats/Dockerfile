ARG BASE_IMAGE=oven/bun:slim
FROM ${BASE_IMAGE}

# Ensure system dependencies are up to date.
RUN apt-get update && apt-get install -y python3 ffmpeg curl

# The compiled project.
ARG JS_ASSET
ENV JS_ASSET=$JS_ASSET

# Each project and its dependencies are compiled. This simplifies the project
# setup. The `docker build` command includes `--build-context dist=/path...` to
# avoid errors with relative paths.
COPY --from=app entry.js /app/
COPY --from=dist ${JS_ASSET} /app/app.js

# Change into the application's working directory.
WORKDIR /app

# Download the preferred Linux version of yt-dlp and add it to the path.
RUN curl -SLO https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
RUN chmod +x /app/yt-dlp
ENV PATH="$PATH:/app"

# Start the cron job.
CMD bun run /app/entry.js
