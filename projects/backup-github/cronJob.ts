import {CronJob} from 'cron'
import {timeZone} from '../../common/timeZone'
import {createLogger, invariant} from '@qodestack/utils'
import {backupGithub} from './backupGithub'
import {$} from 'bun'
import {
  logJobBeginningMessage,
  logJobEndMessage,
} from '../../common/logJobMessage'

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

const job = CronJob.from({
  cronTime: Bun.env.CRON_TIME ?? '0 0 3 * * *', // Daily at 3am
  start: true,
  timeZone,
  onTick: handleJob,
})

async function handleJob() {
  const log = createLogger({timeZone})

  log.text('Starting backup Github cron job...')

  try {
    log.text('Getting github token from global git config...')

    const token = (await $`git config --get credential.password`.text()).trim()
    const directory = Bun.env.DESTINATION
    invariant(directory, 'DESTINATION env var not found')

    const start = performance.now()
    const {failed, succeeded} = await backupGithub({token, directory})
    const end = performance.now() - start

    const seconds = (end / 1000).toFixed(2)
    log.success(`${succeeded.length} repos backed up in ${seconds}s!`)

    if (failed.length) {
      log.error('Failures:', failed)
    }
  } catch (error) {
    log.error('Process failed:', error)
  }

  logJobEndMessage({job})
}

logJobBeginningMessage({jobName: 'BACKUP GITHUB', job})
