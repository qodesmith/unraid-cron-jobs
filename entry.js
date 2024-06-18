/**
 * If a project exports a `handleJob` function it's for the purpose of
 * triggering an initial run. That run can after an optional delay as well.
 */

import('./app.js')
  .then(mod => {
    const {handleJob} = mod

    if (handleJob) {
      const delay = +Bun.env.DELAY_INITIAL_RUN ?? 0

      if (delay) {
        setTimeout(handleJob, delay)
      } else {
        handleJob()
      }
    }
  })
  .catch(error => {
    console.error(error)
  })
