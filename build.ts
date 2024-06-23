import fs from 'node:fs'
import path from 'node:path'
import {getProjectDependencies} from './common/getProjectDependencies'
import {$} from 'bun'

// The project name will be the third item in the process.argv array
// process.argv[0] is the path to node
// process.argv[1] is the path to your script
// process.argv[2] is the first argument you pass
const singleProjectName = process.argv[2]

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

  const promises = projectNames.map(async name => {
    const projectPath = `${projectsPath}/${name}`
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
    const dockerfilePath = !!Bun.file(localDockerfilePath).size
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
      `qodesmith/${name}:latest`,

      // Dockerfile location.
      '-f',
      dockerfilePath,
    ]

    // Build for Unraid or the local machine.
    if (!Bun.env.LOCAL) args.push('--platform=linux/amd64')

    return $`docker build ${args} .`.nothrow()
  })

  return Promise.all(promises)
}

async function dockerPush() {
  console.log('Pushing images...')

  return Promise.all(
    projectNames.map(name => $`docker push qodesmith/${name}:latest`.nothrow())
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
