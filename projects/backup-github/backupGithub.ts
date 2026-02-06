import {$} from 'bun'
import fs from 'node:fs'
import path from 'node:path'

import {createLogger} from '@qodestack/utils'
import {Octokit} from 'octokit'

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
  const archiveDir = `${absoluteDir}/archive`

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

  // Each repo gets its own folder with a zip and github-issues.json.
  const promises = repos.reduce<
    Promise<{
      repoUrl: string
      zipFilePath: string
      name: string
      repoUpdatedAt: number
      zipLastModified: number | null
    }>[]
  >((acc, {name, owner, html_url, updated_at}) => {
    const repoFolder = `${absoluteDir}/${name}`
    const zipFilePath = `${repoFolder}/${name}.zip`
    const issuesFilePath = `${repoFolder}/github-issues.json`
    const zipExists = fs.existsSync(zipFilePath)
    const zipLastModified = zipExists ? fs.statSync(zipFilePath).mtimeMs : null
    const repoUpdatedAt = +new Date(updated_at ?? 0)

    const needsZip =
      !zipExists ||
      (zipLastModified !== null && repoUpdatedAt > zipLastModified)
    const needsIssues = !fs.existsSync(issuesFilePath)

    // Skip repos that don't need any updates.
    if (!(needsZip || needsIssues)) return acc

    acc.push(
      (async () => {
        const cloneUrl = `https://${owner.login}:${token}@github.com/${owner.login}/${name}.git`
        const maskedCloneUrl = cloneUrl.replace(token, '<token>')

        try {
          fs.mkdirSync(repoFolder, {recursive: true})

          if (needsZip) {
            const repoDir = `${tempDirAbsolute}/${name}`
            fs.mkdirSync(repoDir, {recursive: true})

            // Clone.
            await $`git clone ${cloneUrl} ${repoDir}`.quiet()

            // Zip.
            const tempZipPath = `${tempDirAbsolute}/${name}.zip`
            await $`zip -r ${tempZipPath} ${repoDir}`.quiet()

            // Delete the old zip file if it exists.
            if (zipExists) fs.unlinkSync(zipFilePath)

            // Move the new zip file.
            fs.renameSync(tempZipPath, zipFilePath)

            log.text(`  💾 ➡ ${name}`)
          }

          if (needsIssues) {
            // Fetch all issues (open + closed) with their comments.
            const [issues, comments] = await Promise.all([
              listAllIssues({octokit, owner: owner.login, repo: name}),
              listAllComments({octokit, owner: owner.login, repo: name}),
            ])

            // Group comments by issue number.
            const commentsByIssue: Record<number, typeof comments> = {}

            for (const comment of comments) {
              const issueNumber = comment.issue_url.split('/').pop()
              if (issueNumber) {
                const num = Number(issueNumber)
                if (!commentsByIssue[num]) commentsByIssue[num] = []
                commentsByIssue[num].push(comment)
              }
            }

            // Attach comments to each issue.
            const issuesWithComments = issues.map(issue => ({
              ...issue,
              conversation: commentsByIssue[issue.number] ?? [],
            }))

            fs.writeFileSync(
              issuesFilePath,
              JSON.stringify(issuesWithComments, null, 2)
            )

            log.text(`  📋 ➡ ${name} (issues)`)
          }

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
    failed: {error: unknown; name: string; maskedCloneUrl: string}[]
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

  // Archive repo folders no longer having a repo on Github.
  log.text('Archiving backups without a Github repository...')
  const repoNamesSet = new Set(repos.map(({name}) => name))
  const skipDirs = new Set(['archive', tempDirName])
  const archived = fs.readdirSync(absoluteDir).reduce<string[]>((acc, name) => {
    const currentPath = `${absoluteDir}/${name}`
    const archivedPath = `${archiveDir}/${name}`
    const isDirectory = fs.statSync(currentPath).isDirectory()

    if (isDirectory && !skipDirs.has(name) && !repoNamesSet.has(name)) {
      try {
        acc.push(name)
        fs.renameSync(currentPath, archivedPath)
        log.text(`  📦 ➡ ${name}`)
      } catch (_error) {
        log.error(
          'Unable to move archive:\n',
          `  FROM - ${currentPath}\n`,
          `  TO   - ${archivedPath}`
        )
      }
    }

    return acc
  }, [])

  return {failed, succeeded, archived}
}

type OctokitLibrary = InstanceType<typeof Octokit>
type ReposResponse = Awaited<
  ReturnType<OctokitLibrary['rest']['repos']['listForAuthenticatedUser']>
>
type IssuesResponse = Awaited<
  ReturnType<OctokitLibrary['rest']['issues']['listForRepo']>
>
type CommentsResponse = Awaited<
  ReturnType<OctokitLibrary['rest']['issues']['listCommentsForRepo']>
>

async function listAllIssues({
  octokit,
  owner,
  repo,
  page = 1,
  issues = [],
}: {
  octokit: OctokitLibrary
  owner: string
  repo: string
  page?: number
  issues?: IssuesResponse['data']
}): Promise<IssuesResponse['data']> {
  const response = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: 'all',
    // biome-ignore lint/style/useNamingConvention: github api shape
    per_page: 100,
    page,
  })

  issues.push(...response.data)

  // Check for more pages via link header.
  const {link} = response.headers
  if (!link?.includes('rel="next"')) return issues

  return listAllIssues({octokit, owner, repo, page: page + 1, issues})
}

async function listAllComments({
  octokit,
  owner,
  repo,
  page = 1,
  comments = [],
}: {
  octokit: OctokitLibrary
  owner: string
  repo: string
  page?: number
  comments?: CommentsResponse['data']
}): Promise<CommentsResponse['data']> {
  const response = await octokit.rest.issues.listCommentsForRepo({
    owner,
    repo,
    // biome-ignore lint/style/useNamingConvention: github api shape
    per_page: 100,
    page,
  })

  comments.push(...response.data)

  const {link} = response.headers
  if (!link?.includes('rel="next"')) return comments

  return listAllComments({octokit, owner, repo, page: page + 1, comments})
}

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
