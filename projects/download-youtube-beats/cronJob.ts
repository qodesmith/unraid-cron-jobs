import {CronJob} from 'cron'
import {downloadYoutubeBeats} from './downloadYoutubeBeats'
import {timeZone} from '../../common/timeZone'
import {logJobEndMessage} from '../../common/logJobEndMessage'
import dotenv from 'dotenv'
import {createLogger} from '@qodestack/utils'
import {$} from 'bun'

/*

  field          allowed values
  -----          --------------
  second         0-59
  minute         0-59
  hour           0-23
  day of month   1-31
  month          1-12 (or names, see below)
  day of week    0-7 (0 or 7 is Sunday, or use names)

  The `cron` package uses a 6-slot cron syntax, the first slot being seconds.
  You can also use a regular Unix 5-slot syntax which will default the seconds
  slot to 0.

*/

// Load secret env vars from the Unraid server.
dotenv.config({path: '/env/download-youtube-beats.env'})

const fullJob = CronJob.from({
  cronTime: Bun.env.CRON_TIME_FULL_JOB ?? '0 15 2 * * *', // Every day at 2:15am
  start: true,
  timeZone,
  onTick: () => handleJob({isFullJob: true, updateDeps: true}),
})

const job = CronJob.from({
  cronTime: Bun.env.CRON_TIME ?? '0 15 0,4-23 * * *', // Every 2 (even) hours, 15 past the hour, EXCEPT 2:15am.
  start: true,
  timeZone,
  onTick: () => handleJob({isFullJob: false}),
})

export async function handleJob({
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

  await downloadYoutubeBeats({isFullJob})

  logJobEndMessage({
    job: isFullJob ? fullJob : job,
    jobName: isFullJob ? 'full beats download' : undefined,
  })
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
