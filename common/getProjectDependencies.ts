import fs from 'node:fs'
import path from 'node:path'

import depTree from 'dependency-tree'

import packageJson from '../package.json'

const pkgJsonDeps = packageJson.dependencies

type PackageName = keyof typeof pkgJsonDeps

export function getProjectDependencies(name: string) {
  const projectPath = path.resolve(import.meta.dir, `../projects/${name}`)
  const tree = depTree({
    filename: `${projectPath}/cronJob.ts`,
    directory: projectPath,
  })

  const deps = traverseTree(tree as Record<string, unknown>) as PackageName[]

  return deps.reduce<Partial<Record<PackageName, string>>>((acc, dep) => {
    acc[dep] = pkgJsonDeps[dep]
    return acc
  }, {})
}

function traverseTree(tree: Record<string, unknown>): string[] {
  return Object.keys(tree).reduce<string[]>((acc, filePath) => {
    if (!filePath.includes('/node_modules/')) {
      const subTree = tree[filePath] as Record<string, unknown>
      const results = traverseTree(subTree)
      return acc.concat(results)
    }

    const name = getPackageName(filePath)
    if (name) acc.push(name)

    return acc
  }, [])
}

function getPackageName(filePath: string): string | undefined {
  const [projectPath, pkgFilePath] = filePath.split('/node_modules/')
  const pkgPathSegments = pkgFilePath.split('/')
  let segment = ''

  for (const seg of pkgPathSegments) {
    segment += `/${seg}`
    const pkgJsonPath = `${projectPath}/node_modules${segment}/package.json`

    if (Bun.file(pkgJsonPath).size) {
      const pkgJson = JSON.parse(
        fs.readFileSync(pkgJsonPath, {encoding: 'utf8'})
      )
      return pkgJson.name
    }
  }
}
