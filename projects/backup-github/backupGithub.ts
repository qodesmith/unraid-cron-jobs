import {Octokit} from 'octokit'
import path from 'node:path'
import {$} from 'bun'
import fs from 'node:fs'
import {createLogger} from '@qodestack/utils'
import {timeZone} from '../../common/timeZone'

/**
 * We only keep a single archive of each repo. Why? Because when you clone a
 * repository, like we do with this utility, you get the entire git history of
 * that repository. We don't need to version our backups, we just need to get
 * the latest version of the repo knowing git has the full history.
 */

export async function backupGithub({
  token,
  directory,
}: {
  token: string
  directory: string
}) {
  const log = createLogger({timeZone})

  // Directories
  const absoluteDir = path.resolve(directory)
  const tempDirName = 'tmp-repo-downloads'
  const tempDirAbsolute = path.resolve(absoluteDir, tempDirName)

  log.text('Getting directories ready...')

  // Clean up anything potentially left from prior runs.
  await $`rm -rf ${tempDirAbsolute}`.quiet()

  // Create the temp directory fresh.
  await $`mkdir ${tempDirAbsolute}`.quiet()

  log.text('Fetching repositories...')

  // Initialize the Github API.
  const octokit = new Octokit({auth: token})

  /**
   * Get all repos.
   * https://github.com/octokit/plugin-rest-endpoint-methods.js/blob/main/docs/repos/listForAuthenticatedUser.md
   */
  const responses = await listForAuthenticatedUser({
    octokit,
    responses: [],
    page: 1,
  })
  const repos = responses.reduce<(typeof responses)[number]['data']>(
    (acc, item) => acc.concat(item.data),
    []
  )

  log.text('Cloning, zipping, and saving repositories...')

  // Each repo gets cloned, zipped, and stored in the proper folder.
  const promises = repos.reduce<
    Promise<{
      repoUrl: string
      zipFilePath: string
      name: string
      repoUpdatedAt: number
      zipLastModified: number | null
    }>[]
  >((acc, {name, owner, html_url, updated_at}) => {
    const oldFilePath = `${absoluteDir}/${name}.zip`
    const {size} = Bun.file(oldFilePath)
    const zipLastModified = size ? fs.statSync(oldFilePath).mtimeMs : null
    const repoUpdatedAt = +new Date(updated_at ?? 0)

    // Skip repos that haven't been updated since the last backup.
    if (zipLastModified && repoUpdatedAt <= zipLastModified) return acc

    acc.push(
      (async () => {
        const cloneUrl = `https://${owner.login}:${token}@github.com/${owner.login}/${name}.git`

        // Make temp dir to clone the repo into.
        const repoDir = `${tempDirAbsolute}/${name}`
        fs.mkdirSync(repoDir, {recursive: true})

        // For errors, log this url which doesn't have the token.
        const maskedCloneUrl = cloneUrl.replace(token, '<token>')

        try {
          // Clone.
          await $`git clone ${cloneUrl} ${repoDir}`.quiet()

          // Zip.
          const zipFilePath = `${tempDirAbsolute}/${name}.zip`
          await $`zip -r ${zipFilePath} ${repoDir}`.quiet()

          // Delete the old zip file.
          if (size) fs.unlinkSync(oldFilePath)

          // Move the new zip file to the old location.
          fs.renameSync(zipFilePath, oldFilePath)

          log.text(`  💾 ➡ ${name}`)

          return {
            repoUrl: html_url,
            zipFilePath,
            name,
            repoUpdatedAt,
            zipLastModified,
          }
        } catch (error) {
          throw {error, name, maskedCloneUrl}
        }
      })()
    )

    return acc
  }, [])

  const results = await Promise.allSettled(promises)
  const {failed, succeeded} = results.reduce<{
    failed: {error: any; name: string; maskedCloneUrl: string}[]
    succeeded: NonNullable<Awaited<(typeof promises)[number]>>[]
  }>(
    (acc, item) => {
      if (item.status === 'fulfilled' && item.value) {
        acc.succeeded.push(item.value)
      } else if (item.status === 'rejected') {
        acc.failed.push(item.reason)
      }

      return acc
    },
    {failed: [], succeeded: []}
  )

  // Remove the temp dir.
  await $`rm -rf ${tempDirAbsolute}`

  return {failed, succeeded}
}

type OctokitLibrary = InstanceType<typeof Octokit>
type ReposResponse = Awaited<
  ReturnType<OctokitLibrary['rest']['repos']['listForAuthenticatedUser']>
>

async function listForAuthenticatedUser({
  octokit,
  responses,
  page,
}: {
  octokit: InstanceType<typeof Octokit>
  responses: ReposResponse[]
  page: number
}): Promise<ReposResponse[]> {
  const response = await octokit.rest.repos.listForAuthenticatedUser({
    visibility: 'all',
    affiliation: 'owner',
    page,
  })

  responses.push(response)

  const {link} = response.headers
  if (!link) return responses

  /*
    Example lines:
    [
      '<https://api.github.com/user/repos?visibility=all&affiliation=owner&page=1>; rel="prev"',
      '<https://api.github.com/user/repos?visibility=all&affiliation=owner&page=3>; rel="next"',
      '<https://api.github.com/user/repos?visibility=all&affiliation=owner&page=3>; rel="last"',
      '<https://api.github.com/user/repos?visibility=all&affiliation=owner&page=1>; rel="first"'
    ]
  */
  const lines = link.split(',').map(v => v.trim())
  const last = lines.find(line => line.endsWith('"last"'))
  if (!last) return responses

  const url = new URL(last.slice(1, -13))
  const lastPage = Number(url.searchParams.get('page'))

  return page === lastPage
    ? responses
    : listForAuthenticatedUser({octokit, responses, page: page + 1})
}
