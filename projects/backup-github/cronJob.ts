import {Cron} from 'croner'
import {timeZone} from '../../common/timeZone'
import {createLogger, invariant, pluralize} from '@qodestack/utils'
import {backupGithub} from './backupGithub'
import {$} from 'bun'
import {
  logJobBeginningMessage,
  logJobEndMessage,
} from '../../common/logJobMessage'

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

const job = new Cron(
  Bun.env.CRON_TIME ?? '0 0 3 * * *', // Daily at 3am
  {timezone: timeZone, name: 'BACKUP GITHUB'},
  handleJob
)

async function handleJob() {
  const log = createLogger({timeZone})

  log.text('Starting backup Github cron job...')

  try {
    log.text('Getting github token from global git config...')

    const token = (await $`git config --get credential.password`.text()).trim()
    const directory = Bun.env.DESTINATION
    invariant(directory, 'DESTINATION env var not found')

    const start = performance.now()
    const {failed, succeeded, archived} = await backupGithub({token, directory})
    const end = performance.now() - start

    const seconds = (end / 1000).toFixed(2)
    const shouldLogSuccess = !!succeeded.length || !!archived.length
    const logType = shouldLogSuccess ? 'success' : 'text'
    log[logType](
      pluralize(succeeded.length, 'repo'),
      'backed up &',
      pluralize(archived.length, 'file'),
      `archived in ${seconds}s!`
    )

    if (failed.length) {
      log.error('Failures:', failed)
    }
  } catch (error) {
    log.error('Process failed:', error)
  }

  logJobEndMessage(job)
}

logJobBeginningMessage(job)
