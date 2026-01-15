import type {Cron} from 'croner'

import {createLogger} from '@qodestack/utils'

import {timeZone} from './timeZone'

type CreateServerOptions = {
  getIsBusy: () => boolean
  logMetadata?: () => void
}

const log = createLogger({timeZone})

/**
 * Each individual app is able to import, create, and run this server.
 *
 * This server solely exists to enable triggering a cron job manually, ad-hoc.
 * There are no routes and no specific paths. Simply making a POST request to
 * this server's URL will suffice.
 *
 * Since the containers running this server don't have any exposed ports, this
 * server can't be accessed publicly. The  only way to access this server is
 * directly from another container on the same Docker network. It is the
 * responsibility of the requesting container to safeguard requests to this
 * server in some way.
 */
export function createServer(
  job: Cron,
  {getIsBusy, logMetadata}: CreateServerOptions
) {
  return Bun.serve({
    port: 10_001,
    fetch(req) {
      if (req.method !== 'POST') {
        return Response.json({error: 'Not authorized'}, {status: 401})
      }

      const canTriggerJob = !getIsBusy()

      logMetadata?.()

      if (canTriggerJob) {
        log.success(`Manually triggering job run - ${job.name}`)
        job.trigger()
      } else {
        log.warning(
          `Job already running. Unable to manually trigger run - ${job.name}`
        )
      }

      return Response.json({jobTriggered: canTriggerJob})
    },
  })
}
