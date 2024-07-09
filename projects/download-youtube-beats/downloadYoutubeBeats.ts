import {
  downloadYouTubePlaylist,
  type DownloadType,
  type Results,
  type Video,
} from '@qodestack/dl-yt-playlist'
import {getLocalDate, invariant} from '@qodestack/utils'
import {createLogger, pluralize} from '@qodestack/utils'
import {timeZone} from '../../common/timeZone'
import fs from 'node:fs'
import {$} from 'bun'

type FinalResultsObj = Results & {
  date: string
  job: 'beats' | 'fullBeats'
  hasErrors: boolean
}

export async function downloadYoutubeBeats({isFullJob}: {isFullJob: boolean}) {
  const log = createLogger({timeZone})

  try {
    const {
      playlistId,
      youTubeApiKey,
      directory,
      downloadType,
      audioFormat,
      videoFormat,
      downloadThumbnails,
      maxDurationSeconds,
      mostRecentItemsCount,
      silent,
      maxConcurrentFetchCalls,
      maxConcurrentYtdlpCalls,
      saveRawResponses,
    } = (() => {
      const {
        PLAYLIST_ID,
        YOUTUBE_API_KEY,
        DESTINATION,
        DOWNLOAD_TYPE,
        AUDIO_FORMAT,
        VIDEO_FORMAT,
      } = Bun.env
      invariant(PLAYLIST_ID, 'PLAYLIST_ID env var not found')
      invariant(YOUTUBE_API_KEY, 'YOUTUBE_API_KEY env var not found')
      invariant(DESTINATION, 'DESTINATION env var not found')
      invariant(DOWNLOAD_TYPE, 'DOWNLOAD_TYPE env var not found')

      return {
        playlistId: PLAYLIST_ID,
        youTubeApiKey: YOUTUBE_API_KEY,
        directory: DESTINATION,
        downloadType: DOWNLOAD_TYPE as DownloadType,
        audioFormat: AUDIO_FORMAT,
        videoFormat: VIDEO_FORMAT,
        downloadThumbnails: Bun.env.DOWNLOAD_THUMBNAILS === 'true',
        maxDurationSeconds: Bun.env.MAX_DURATION_SECONDS
          ? Number(Bun.env.MAX_DURATION_SECONDS)
          : undefined,
        mostRecentItemsCount: Bun.env.MOST_RECENT_ITEMS_COUNT
          ? Number(Bun.env.MOST_RECENT_ITEMS_COUNT)
          : undefined,
        silent: Bun.env.SILENT === 'true',
        maxConcurrentFetchCalls: Bun.env.MAX_CONCURRENT_FETCH_CALLS
          ? Number(Bun.env.MAX_CONCURRENT_FETCH_CALLS)
          : undefined,
        maxConcurrentYtdlpCalls: Bun.env.MAX_CONCURRENT_YTDLP_CALLS
          ? Number(Bun.env.MAX_CONCURRENT_YTDLP_CALLS)
          : undefined,
        saveRawResponses: Bun.env.SAVE_RAW_RESPONSES === 'true',
      }
    })()

    const results = await downloadYouTubePlaylist({
      playlistId,
      youTubeApiKey,
      directory,
      downloadType,
      audioFormat,
      videoFormat,
      downloadThumbnails,
      maxDurationSeconds,
      mostRecentItemsCount: isFullJob ? undefined : mostRecentItemsCount,
      silent,
      timeZone,
      maxConcurrentFetchCalls,
      maxConcurrentYtdlpCalls,
      saveRawResponses,
    })

    try {
      const thumbnailResults = await genSmallThumbnails(directory)
      const successCount = thumbnailResults.successes.length
      const failureCount = thumbnailResults.failures.length

      if (failureCount) {
        log.warning(
          pluralize(failureCount, 'small thumbnail'),
          'failed to generate'
        )
      }

      if (successCount) {
        log.text(pluralize(successCount, 'small thumbnail'), 'generated')
      }
    } catch (thumbnailError) {
      log.error('Failed to generate small thumbnails:', thumbnailError)
    }

    try {
      const resultsFilePath = `${directory}/results.json`
      const resultsList: FinalResultsObj[] = await (async () => {
        try {
          return await Bun.file(resultsFilePath).json()
        } catch {
          return []
        }
      })()

      resultsList.unshift({
        date: getLocalDate(),
        job: isFullJob ? 'fullBeats' : 'beats',
        hasErrors: resultsHaveErrors(results),
        ...results,
      })

      await Bun.write(
        resultsFilePath,
        // Only keep 100 records.
        JSON.stringify(resultsList.slice(0, 100), null, 2)
      )
    } catch {
      log.error('Failed to write results')
    }
  } catch (error: any) {
    log.error('Job failed:', error?.message)
  }
}

function resultsHaveErrors(results: Results): boolean {
  return Object.values(results.failureData).some(errArr => !!errArr.length)
}

async function genSmallThumbnails(directory: string) {
  const metadata: Video[] = await Bun.file(`${directory}/metadata.json`).json()
  const failures: string[] = []
  const successes: string[] = []

  for (const video of metadata) {
    const {id} = video
    const imagePath = `${directory}/${id}.jpg`
    const smallImagePath = `${directory}/${id}[small].jpg`

    if (!fs.existsSync(smallImagePath)) {
      const {exitCode} =
        await $`magick ${imagePath} -resize 40x40^ -gravity center -extent 40x40 ${smallImagePath}`.nothrow()
      if (exitCode === 0) {
        successes.push(id)
      } else {
        failures.push(id)
      }
    }
  }

  return {successes, failures}
}
