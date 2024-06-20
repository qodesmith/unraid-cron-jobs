import {createLogger} from '@qodestack/utils'
import {timeZone} from './timeZone'
import type {CronJob} from 'cron'

export function logJobEndMessage(job: CronJob<null, null>) {
  const log = createLogger({timeZone})
  const nextRunDate = new Date(+job.nextDate()).toLocaleString('en-US', {
    timeZone,
  })

  log.text('Next job at', nextRunDate)
  console.log('-'.repeat(100))
}
