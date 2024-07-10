import {Cron} from 'croner'
import {pruneNotionBackups} from './pruneNotionBackups'
import {timeZone} from '../../common/timeZone'
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
  Bun.env.CRON_TIME ?? '0 0 2 * * *', // Every day at 2am,
  {timezone: timeZone, name: 'PRUNE NOTION BACKUPS'},
  handleJob
)

function handleJob() {
  pruneNotionBackups()
  logJobEndMessage(job)
}

logJobBeginningMessage(job)
