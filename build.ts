import {$} from 'bun'
import fs from 'node:fs'
import path from 'node:path'

const defaultDockerfilePath = path.resolve(import.meta.dir, 'Dockerfile.basic')
const distPath = path.resolve(import.meta.dir, 'dist')
const names = fs
  .readdirSync('./projects')
  .reduce<{name: string; dockerFilePath: string; baseImage?: string}[]>(
    (acc, name) => {
      const projectDockerFile = `./projects/${name}/Dockerfile`
      const hasDockerfile = !!Bun.file(projectDockerFile).size
      const dockerFilePath = hasDockerfile
        ? projectDockerFile
        : defaultDockerfilePath
      const isDirectory = fs.statSync(`./projects/${name}`).isDirectory()
      const isEmpty = isDirectory
        ? !fs.readdirSync(`./projects/${name}`).length
        : true
      const baseImage = (() => {
        try {
          return fs
            .readFileSync(`./projects/${name}/baseImage.txt`, {
              encoding: 'utf8',
            })
            .split('\n')[0]
        } catch {
          return undefined
        }
      })()

      if (isDirectory && !isEmpty) {
        acc.push({name, dockerFilePath, baseImage})
      }

      return acc
    },
    []
  )

async function buildProjects() {
  fs.rmSync('./dist', {recursive: true, force: true})

  return Promise.all(
    names.map(({name}) => {
      return Bun.build({
        entrypoints: [`./projects/${name}/cronJob.ts`],
        outdir: './dist',
        naming: `${name}.[ext]`,
        target: 'bun',
        external: [],
        sourcemap: 'inline',
      })
    })
  )
}

async function dockerBuild() {
  return Promise.all(
    names.map(({name, dockerFilePath, baseImage}) => {
      const args: string[] = [
        // Compiled JS file.
        '--build-arg',
        `JS_ASSET=${name}.js`,

        // Avoid relative paths for COPY in the Dockerfile.
        '--build-context',
        `dist=${distPath}`,

        // Tag.
        '-t',
        `qodesmith/${name}:latest`,

        // Dockerfile location.
        '-f',
        dockerFilePath,
      ]

      // Override the base image.
      if (baseImage) args.push('--build-arg', `BASE_IMAGE=${baseImage}`)

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
