import {CronJob} from 'cron'
import {scrapeCassettes} from './scrapeCassettes'
import {log} from '@qodestack/utils'

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
  cronTime: Bun.env.CRON_TIME ?? '0 44 1 * * 1', // Every Monday at 1:44am
  start: true,
  timeZone: 'America/New_York',
  onTick: handleJob,
})

async function handleJob() {
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

  console.log('-'.repeat(100))
}

handleJob()
