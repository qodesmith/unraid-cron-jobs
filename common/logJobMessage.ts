import {createLogger} from '@qodestack/utils'
import {timeZone} from './timeZone'
import type {Cron} from 'croner'

/**
 * Logs a "Next job at..." message.
 */
export function logJobEndMessage(job: Cron) {
  const jobName = job.name
  const log = createLogger({timeZone})
  const name = jobName ? `${jobName} ` : ''
  const nextRunDate = job.nextRun()?.toLocaleString('en-US', {timeZone})

  log.text(`Next ${name}job at`, nextRunDate ?? '???')
  console.log('-'.repeat(100))
}

export function logJobBeginningMessage(job: Cron, initialMsg?: string) {
  const jobName = job.name ?? ''
  const log = createLogger({timeZone})
  const nameLength = jobName.length

  console.log('/'.repeat(nameLength + 6)) //////////////
  console.log(`// ${jobName} //`) //       // JOB NAME //
  console.log('/'.repeat(nameLength + 6)) //////////////
  log.text() // Logs the date
  console.log('')

  if (initialMsg) {
    console.log(initialMsg)
    console.log('')
  }

  if (job) {
    const nextRunDate = job.nextRun()?.toLocaleString('en-US', {timeZone})
    console.log(`Job will start at`, nextRunDate ?? '???')
  }

  console.log('-'.repeat(100))
}
