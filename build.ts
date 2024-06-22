import {$} from 'bun'
import fs from 'node:fs'
import path from 'node:path'
import {createLogger} from '@qodestack/utils'
import {timeZone} from './common/timeZone'

const log = createLogger({timeZone})
const defaultDockerfilePath = path.resolve(import.meta.dir, 'Dockerfile.basic')
const distPath = path.resolve(import.meta.dir, 'dist')
const names = fs
  .readdirSync('./projects')
  .reduce<{name: string; dockerFilePath: string; projectPath: string}[]>(
    (acc, name) => {
      const projectDockerFile = `./projects/${name}/Dockerfile`
      const hasDockerfile = !!Bun.file(projectDockerFile).size
      const projectPath = `./projects/${name}`
      const dockerFilePath = hasDockerfile
        ? projectDockerFile
        : defaultDockerfilePath
      const isDirectory = fs.statSync(`./projects/${name}`).isDirectory()
      const hasCronJob = !!Bun.file(`./projects/${name}/cronJob.ts`).size

      if (isDirectory && hasCronJob) {
        acc.push({name, dockerFilePath, projectPath})
      }

      return acc
    },
    []
  )

async function buildProjects() {
  fs.rmSync('./dist', {recursive: true, force: true})

  const projectNames = names.map(({name}) => name).join('\n  - ')
  log.text('Build the following projects:', `\n  - ${projectNames}`)

  return Promise.allSettled(
    names.map(({name}) => {
      return Bun.build({
        entrypoints: [`./projects/${name}/cronJob.ts`],
        outdir: './dist',
        naming: `${name}.[ext]`,
        target: 'bun',
        external: [],
        sourcemap: 'inline',
      }).then(({success, ...x}) => {
        if (!success) throw `"${name}" failed to build`
      })
    })
  ).then(results => {
    results.forEach(res => {
      if (res.status === 'rejected') {
        log.error(res.reason)
      }
    })
  })
}

async function dockerBuild() {
  return Promise.all(
    names.map(async ({name, dockerFilePath, projectPath}) => {
      const extraBuildArgs = await (async () => {
        try {
          const args: string[] = []
          const json = await Bun.file(
            `${projectPath}/name/dockerfileArgs.json`
          ).json()

          Object.entries(json).forEach(([key, value]) => {
            args.push('--build-arg', `${key}=${value}`)
          })

          return args
        } catch {
          return []
        }
      })()

      const args: string[] = [
        ...extraBuildArgs,

        // Compiled JS file.
        '--build-arg',
        `JS_ASSET=${name}.js`,

        // Avoid relative paths for COPY in the Dockerfile.
        '--build-context',
        `dist=${distPath}`,

        '--build-context',
        `app=${import.meta.dir}`,

        // Tag.
        '-t',
        `qodesmith/${name}:latest`,

        // Dockerfile location.
        '-f',
        dockerFilePath,
      ]

      // Build for Unraid or the local machine.
      if (!Bun.env.LOCAL) args.push('--platform=linux/amd64')

      return $`docker build ${args} ./projects/${name}`.nothrow()
    })
  )
}

async function dockerPush() {
  return Promise.all(
    names.map(({name}) => $`docker push qodesmith/${name}:latest`.nothrow())
  )
}

await buildProjects()
if (!Bun.env.NO_BUILD) await dockerBuild()
if (!Bun.env.NO_PUSH) await dockerPush()
