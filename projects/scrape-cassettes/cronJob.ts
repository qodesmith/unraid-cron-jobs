import {Cron} from 'croner'
import {createLogger} from '@qodestack/utils'
import {
  logJobBeginningMessage,
  logJobEndMessage,
} from '../../common/logJobMessage'
import {timeZone} from '../../common/timeZone'

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
  Bun.env.CRON_TIME ?? '0 44 1 * * 1', // Every Monday at 1:44am,
  {timezone: timeZone, name: 'SCRAPE CASSETTES'},
  handleJob
)

async function handleJob() {
  const log = createLogger({timeZone})
  const {scrapeCassettes} = await import('./scrapeCassettes')

  try {
    log.text('Downloading cassettes...')
    const {duplicates, errors, success, itemsForDownload, itemsOnPage} =
      await scrapeCassettes()

    if (errors.length) {
      log.error(errors.length, 'failed downloads.')
    }

    if (success.length) {
      log.success(success.length, 'images downloaded!')
    }

    if (!errors.length && !success.length) {
      log.text('No images to download!')
    }
  } catch (error) {
    log.error('`scrapeCassettes` process failed:', error)
  }

  logJobEndMessage(job)
}

logJobBeginningMessage(job)
