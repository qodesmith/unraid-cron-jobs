/** biome-ignore-all lint/suspicious/noConsole: it's ok */

import {$} from 'bun'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import {getProjectDependencies} from './common/getProjectDependencies'

// The project name will be the third item in the process.argv array
// process.argv[0] is the path to node
// process.argv[1] is the path to your script
// process.argv[2] is the first argument you pass
const singleProjectName = process.argv[2]

const tag = 'unraid'
const defaultDockerfilePath = path.resolve(import.meta.dir, 'Dockerfile.basic')
const projectsPath = path.resolve(import.meta.dir, './projects')
const projectNames = fs.readdirSync(projectsPath).filter(name => {
  if (singleProjectName) return name === singleProjectName
  return true
})

if (singleProjectName && !projectNames.length) {
  console.error(`${singleProjectName} not found`)
  process.exit()
}

const projectDependencies = projectNames.reduce<
  Record<string, Record<string, string>>
>((acc, name) => {
  acc[name] = getProjectDependencies(name)
  return acc
}, {})

async function dockerBuild() {
  console.log('Building images...')

  const results = await Promise.all(
    projectNames.map(async name => {
      const projectPath = `${projectsPath}/${name}`

      /**
       * `dockerfileArgs.json` can specify a BASE_IMAGE to pin a specific Bun
       * version. This is often needed because newer versions of Bun frequently
       * segfault during `bun install` when Docker uses QEMU to emulate a
       * different CPU architecture (e.g. building linux/amd64 on an ARM Mac).
       * This is a long-standing issue across both the Bun and Docker buildx
       * projects:
       *
       * Bun segfaults in Docker / QEMU:
       *   - https://github.com/oven-sh/bun/issues/9924
       *   - https://github.com/oven-sh/bun/issues/24397
       *   - https://github.com/oven-sh/bun/issues/26635
       *
       * Docker buildx QEMU segfaults:
       *   - https://github.com/docker/buildx/issues/1170
       *   - https://github.com/docker/buildx/issues/2028
       *   - https://github.com/docker/buildx/issues/3170
       *
       * If builds fail with "qemu: uncaught target signal 11 (Segmentation
       * fault)", try pinning an older Bun version in `dockerfileArgs.json` via
       * the BASE_IMAGE variable.
       */
      const jsonPath = `${projectPath}/dockerfileArgs.json`
      const extraBuildArgs = await (async () => {
        try {
          const json = await Bun.file(jsonPath).json()
          const args: string[] = []

          Object.entries(json).forEach(([key, value]) => {
            args.push('--build-arg', `${key}=${value}`)
          })

          return args
        } catch {
          return []
        }
      })()

      const localDockerfilePath = `${projectPath}/Dockerfile`
      const dockerfilePath = Bun.file(localDockerfilePath).size
        ? localDockerfilePath
        : defaultDockerfilePath

      const args: string[] = [
        ...extraBuildArgs,

        // Project name.
        '--build-arg',
        `PROJECT_NAME=${name}`,

        // Dependencies.
        '--build-arg',
        `PACKAGE_JSON=${JSON.stringify({
          dependencies: projectDependencies[name],
        })}`,

        // Tag.
        '-t',
        `qodesmith/${name}:${tag}`,

        // Dockerfile location.
        '-f',
        dockerfilePath,
      ]

      // Build for Unraid or the local machine.
      if (!Bun.env.LOCAL) args.push('--platform=linux/amd64')

      const result = await $`docker build ${args} .`.nothrow()
      return {name, exitCode: result.exitCode}
    })
  )

  const failed = results.filter(r => r.exitCode !== 0)
  if (failed.length) {
    console.error(`\nBuild failed for: ${failed.map(r => r.name).join(', ')}`)
    process.exit(1)
  }
}

async function dockerPush() {
  console.log('Pushing images...')

  return Promise.all(
    projectNames.map(name => $`docker push qodesmith/${name}:${tag}`.nothrow())
  )
}

await dockerBuild()

if (!Bun.env.NO_PUSH) {
  console.log('\n')
  console.log('-'.repeat(100))
  console.log('-'.repeat(100))
  console.log('-'.repeat(100))
  console.log('\n')

  await dockerPush()
}
