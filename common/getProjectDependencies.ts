import depTree from 'dependency-tree'
import path from 'node:path'
import packageJson from '../package.json'
import fs from 'node:fs'

const pkgJsonDeps = packageJson.dependencies
const depNames = Object.keys(pkgJsonDeps) as PackageName[]

type PackageName = keyof typeof pkgJsonDeps

export function getProjectDependencies(name: string) {
  const projectPath = path.resolve(import.meta.dir, `../projects/${name}`)
  const tree = depTree({
    filename: `${projectPath}/cronJob.ts`,
    directory: projectPath,
  })

  const deps = traverseTree(tree as Record<string, any>) as PackageName[]

  return deps.reduce<Partial<Record<PackageName, string>>>((acc, dep) => {
    acc[dep] = pkgJsonDeps[dep]
    return acc
  }, {})
}

function traverseTree(tree: Record<string, any>): string[] {
  return Object.keys(tree).reduce<string[]>((acc, filePath) => {
    if (!filePath.includes('/node_modules/')) {
      const subTree = tree[filePath]
      const results = traverseTree(subTree)
      return acc.concat(results)
    }

    const relevantPathPortion = filePath.split('/node_modules/')[1]
    const name = depNames.find(name => relevantPathPortion.includes(name))
    if (name) acc.push(name)

    return acc
  }, [])
}
