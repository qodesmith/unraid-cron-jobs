/**
 * If a project exports a `handleJob` function it's for the purpose of
 * triggering an initial run. That run can after an optional delay as well. A
 * single object argument can be passed to `handleJob` via an env var.
 */

import('./app.js')
  .then(mod => {
    const {handleJob} = mod
    const arg = (() => {
      try {
        return JSON.parse(Bun.env.HANDLE_JOB_ARG)
      } catch {
        return {}
      }
    })()

    if (handleJob) {
      const delay = +Bun.env.DELAY_INITIAL_RUN ?? 0

      if (delay) {
        setTimeout(() => handleJob(arg), delay)
      } else {
        handleJob(arg)
      }
    }
  })
  .catch(error => {
    console.error(error)
  })
