import {$} from 'bun'
import fs from 'node:fs'
import path from 'node:path'

const names = fs
  .readdirSync('./src')
  .reduce<{name: string; hasDockerfile: boolean}[]>((acc, name) => {
    const hasDockerfile = !!Bun.file(`./src/${name}/Dockerfile`).size
    const isDirectory = fs.statSync(`./src/${name}`).isDirectory()
    const isEmpty = isDirectory ? !fs.readdirSync(`./src/${name}`).length : true

    if (isDirectory && !isEmpty) {
      acc.push({name, hasDockerfile})
    }

    return acc
  }, [])

async function buildProjects() {
  fs.rmSync('./dist', {recursive: true, force: true})

  return Promise.all(
    names.map(({name}) => {
      return Bun.build({
        entrypoints: [`./src/${name}/cronJob.ts`],
        outdir: './dist',
        naming: `${name}.[ext]`,
        target: 'bun',
        external: [],
      })
    })
  )
}

async function dockerBuild() {
  return Promise.all(
    names.map(({name, hasDockerfile}) => {
      const absoluteDistPath = path.resolve('./dist')
      const absoluteDockerfilePath = path.resolve('./Dockerfile.basic')
      const dockerfileArg = hasDockerfile ? '' : `-f=${absoluteDockerfilePath}`
      const buildArg = hasDockerfile
        ? ''
        : ['--build-arg', `JS_ASSET=${name}.js`]

      return $`docker build --platform=linux/amd64 -t qodesmith/${name}:latest ${dockerfileArg} ${buildArg} --build-context dist=${absoluteDistPath} ./src/${name}`.nothrow()
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
