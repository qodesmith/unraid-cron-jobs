import {Cron} from 'croner'
import {timeZone} from '../../common/timeZone'
import {
  logJobBeginningMessage,
  logJobEndMessage,
} from '../../common/logJobMessage'
import dotenv from 'dotenv'
import {createLogger} from '@qodestack/utils'
import {$} from 'bun'

/*

  ┌────────────── second (optional)
  │ ┌──────────── minute
  │ │ ┌────────── hour
  │ │ │ ┌──────── day of the month
  │ │ │ │ ┌────── month
  │ │ │ │ │ ┌──── day of week
  │ │ │ │ │ │
  * * * * * *

  field          allowed values
  -----          --------------
  second         0-59
  minute         0-59
  hour           0-23
  day of month   1-31
  month          1-12 (or names, see below)
  day of week    0-7 (0 or 7 is Sunday, or use names)

*/

// Load secret env vars from the Unraid server.
dotenv.config({path: '/env/download-youtube-beats.env'})

const fullJob = new Cron(
  Bun.env.CRON_TIME_FULL_JOB ?? '0 15 2 * * *', // Every day at 2:15am
  {
    timezone: timeZone,
    name: 'DOWNLOAD YOUTUBE BEATS (full)',

    // Skip current run if job is already running.
    protect: thisJob => thisJob.isBusy() || job.isBusy(),
  },
  () => handleJob({isFullJob: true, updateDeps: true})
)

const job = new Cron(
  Bun.env.CRON_TIME ?? '0 15 0,4-23/2 * * *', // Every 2 (even) hours, 15 past the hour, EXCEPT 2:15am.
  {
    timezone: timeZone,
    name: 'DOWNLOAD YOUTUBE BEATS',

    // Skip current run if job is already running.
    protect: thisJob => thisJob.isBusy() || fullJob.isBusy(),
  },
  () => handleJob({isFullJob: false})
)

async function handleJob({
  isFullJob,
  updateDeps,
}: {
  isFullJob: boolean
  updateDeps?: boolean
}) {
  const log = createLogger({timeZone})

  if (updateDeps) {
    await updateDependencies()
  }

  const initialMsg = isFullJob
    ? 'Running full beats download'
    : 'Downloading beats'

  log.text(`${initialMsg}...`)

  const {downloadYoutubeBeats} = await import('./downloadYoutubeBeats')
  await downloadYoutubeBeats({isFullJob})

  const cronJob = isFullJob ? fullJob : job
  const nextRun = cronJob.nextRun()?.toLocaleString('en-US', {timeZone})

  if (nextRun) {
    log.text('Next job at', nextRun)
  }

  logJobEndMessage(isFullJob ? fullJob : job)
}

async function updateDependencies() {
  const log = createLogger({timeZone})

  log.text('Updating yt-dlp...')

  const ytdlpRes = await $`yt-dlp --update`.quiet().nothrow()
  if (ytdlpRes.exitCode !== 0) {
    log.error('Failed to update yt-dlp:', ytdlpRes.stderr.toString())
  } else {
    log.text('yt-dlp update complete')
  }

  log.text('Updating ffmpeg...')

  const ffmpegRes = await $`apt-get install ffmpeg`.quiet().nothrow()
  if (ffmpegRes.exitCode !== 0) {
    log.error('Failed to update ffmpeg:', ffmpegRes.stderr.toString())
  } else {
    log.text('ffmpeg update complete')
  }
}

const server = Bun.serve({
  port: Bun.env.BEATS_CRON_CONTAINER_PORT,
  fetch(req) {
    if (req.method !== 'POST') {
      return Response.json({error: 'Not authorized'}, {status: 401})
    }

    const data = {
      job: {
        name: job.name,
        currentRun: job.currentRun(),
        nextRun: job.nextRun(),
        previousRun: job.previousRun(),
        isBusy: job.isBusy(),
        isRunning: job.isRunning(),
        isStopped: job.isStopped(),
      },
      fullJob: {
        name: fullJob.name,
        currentRun: fullJob.currentRun(),
        nextRun: fullJob.nextRun(),
        previousRun: job.previousRun(),
        isBusy: fullJob.isBusy(),
        isRunning: fullJob.isRunning(),
        isStopped: fullJob.isStopped(),
      },
    }

    job.trigger()

    return Response.json(data)
  },
})

const fullNext = Number(fullJob.nextRun()) || 0
const regularNext = Number(job.nextRun()) || 0
const {protocol, port} = server.url

logJobBeginningMessage(
  fullNext < regularNext ? fullJob : job,
  [
    `Server running at ${protocol}//${Bun.env.BEATS_CRON_CONTAINER_NAME}:${port}`,
    'This server only receives communication from the same Docker network it is on.',
    'It is not accessible from the outside world. Its intended use is to provide a',
    'way to trigger a one-off cron job manually via an http request.',
  ].join('\n')
)
