import {CronJob} from 'cron'
import {pruneNotionsBackups} from './pruneNotionBackups'

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
  cronTime: Bun.env.CRON_TIME ?? '0 0 2 * * *', // Every day at 2am
  start: true,
  timeZone: 'America/New_York',
  onTick: handleJob,
})

function handleJob() {
  pruneNotionsBackups()
  console.log('-'.repeat(100))
}
