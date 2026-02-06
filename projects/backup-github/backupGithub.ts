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
  const repos = await listForAuthenticatedUser({octokit})

  log.text('Cloning, zipping, and saving repositories...')

  type RepoResult = {
    repoUrl: string
    zipFilePath: string
    name: string
    repoUpdatedAt: number
    zipLastModified: number | null
  }

  // Each repo gets its own folder with a zip and github-issues.json.
  // Collect work as thunks to control concurrency.
  const work = repos.reduce<(() => Promise<RepoResult>)[]>(
    (acc, {name, owner, html_url, updated_at}) => {
      const repoFolder = `${absoluteDir}/${name}`
      const zipFilePath = `${repoFolder}/${name}.zip`
      const issuesFilePath = `${repoFolder}/github-issues.json`
      const zipExists = fs.existsSync(zipFilePath)
      const zipLastModified = zipExists
        ? fs.statSync(zipFilePath).mtimeMs
        : null
      const repoUpdatedAt = +new Date(updated_at ?? 0)

      const needsZip =
        !zipExists ||
        (zipLastModified !== null && repoUpdatedAt > zipLastModified)
      const issuesExist = fs.existsSync(issuesFilePath)
      const issuesLastModified = issuesExist
        ? fs.statSync(issuesFilePath).mtimeMs
        : null
      const needsIssues =
        !issuesExist ||
        (issuesLastModified !== null && repoUpdatedAt > issuesLastModified)

      // Skip repos that don't need any updates.
      if (!(needsZip || needsIssues)) return acc

      acc.push(async () => {
        const cloneUrl = `https://${owner.login}:${token}@github.com/${owner.login}/${name}.git`
        const maskedCloneUrl = cloneUrl.replace(token, '<token>')

        try {
          fs.mkdirSync(repoFolder, {recursive: true})

          if (needsZip) {
            const repoDir = `${tempDirAbsolute}/${name}`
            fs.mkdirSync(repoDir, {recursive: true})

            // Clone.
            await $`git clone ${cloneUrl} ${repoDir}`.quiet()

            // Zip using relative path so the archive contains only repo contents.
            const tempZipPath = `${tempDirAbsolute}/${name}.zip`
            await $`zip -r ${tempZipPath} ${name}`.cwd(tempDirAbsolute).quiet()

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
          const sanitized =
            error instanceof Error
              ? error.message.replaceAll(token, '<token>')
              : String(error).replaceAll(token, '<token>')
          throw {error: sanitized, name, maskedCloneUrl}
        }
      })

      return acc
    },
    []
  )

  // Process in batches of 5 to limit concurrency.
  const batchSize = 5
  const results: PromiseSettledResult<RepoResult>[] = []
  for (let i = 0; i < work.length; i += batchSize) {
    const batch = work.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(batch.map(fn => fn()))
    results.push(...batchResults)
  }

  const {failed, succeeded} = results.reduce<{
    failed: {error: unknown; name: string; maskedCloneUrl: string}[]
    succeeded: RepoResult[]
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
  fs.mkdirSync(archiveDir, {recursive: true})
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
  repos = [],
  page = 1,
}: {
  octokit: OctokitLibrary
  repos?: ReposResponse['data']
  page?: number
}): Promise<ReposResponse['data']> {
  const response = await octokit.rest.repos.listForAuthenticatedUser({
    visibility: 'all',
    affiliation: 'owner',
    // biome-ignore lint/style/useNamingConvention: github api shape
    per_page: 100,
    page,
  })

  repos.push(...response.data)

  const {link} = response.headers
  if (!link?.includes('rel="next"')) return repos

  return listForAuthenticatedUser({octokit, repos, page: page + 1})
}
