import {createLogger} from '@qodestack/utils'
import {timeZone} from './timeZone'
import type {CronJob} from 'cron'

export function logJobEndMessage({
  job,
  jobName,
}: {
  job: CronJob<null, null>
  jobName?: string
}) {
  const log = createLogger({timeZone})
  const name = jobName ? `${jobName} ` : ''
  const nextRunDate = new Date(+job.nextDate()).toLocaleString('en-US', {
    timeZone,
  })

  log.text(`Next ${name}job at`, nextRunDate)
  console.log('-'.repeat(100))
}

export function logJobBeginningMessage({jobName}: {jobName: string}) {
  const log = createLogger({timeZone})
  const nameLength = jobName.length
  console.log('/'.repeat(nameLength + 6))
  console.log(`// ${jobName} //`)
  console.log('/'.repeat(nameLength + 6))
  log.text('') // Logs the date
  console.log('')
}
