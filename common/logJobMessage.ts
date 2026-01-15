/** biome-ignore-all lint/suspicious/noConsole: it's ok */
import type {Server} from 'bun'
import type {Cron} from 'croner'

import {createLogger} from '@qodestack/utils'

import {timeZone} from './timeZone'

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

export function logJobBeginningMessage(job: Cron, server?: Server<unknown>) {
  const jobName = job.name ?? ''
  const log = createLogger({timeZone})
  const nameLength = jobName.length

  console.log('/'.repeat(nameLength + 6)) //////////////
  console.log(`// ${jobName} //`) //      // JOB NAME //
  console.log('/'.repeat(nameLength + 6)) //////////////
  log.text() // Logs the date
  console.log('')

  if (server) {
    const {protocol, port} = server.url

    console.log(
      [
        `Server running at ${protocol}//${Bun.env.HOSTNAME}:${port}`,
        'This server only receives communication from the same Docker network it is on.',
        'It is not accessible from the outside world. Its intended use is to provide a',
        'way to trigger a one-off cron job manually via an http request.',
      ].join('\n')
    )
    console.log('')
  }

  const nextRunDate = job.nextRun()?.toLocaleString('en-US', {timeZone})
  console.log('Job will start at', nextRunDate ?? '???')

  console.log('-'.repeat(100))
}
