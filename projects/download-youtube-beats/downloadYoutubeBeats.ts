import {
  downloadYouTubePlaylist,
  type DownloadType,
  type Results,
} from '@qodestack/dl-yt-playlist'
import {getLocalDate, invariant} from '@qodestack/utils'
import {createLogger, pluralize} from '@qodestack/utils'
import {timeZone} from '../../common/timeZone'
import {processThumbnails} from './processThumbnails'

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
      const {
        fullSizeSuccesses,
        fullSizeFailures,
        smallSizeSuccesses,
        smallSizeFailures,
        notFound,
        bytesSaved,
        alreadyExist,
      } = await processThumbnails({
        directory,
        videosDownloaded: results.videosDownloaded,
      })

      if (alreadyExist.length) {
        log.warning(pluralize(alreadyExist.length, 'image'), 'already exist:')
        log.text(alreadyExist)
      }

      if (notFound.length) {
        log.warning(pluralize(notFound.length, 'image'), 'not found!')
      }

      if (fullSizeFailures.length) {
        log.warning(
          pluralize(fullSizeFailures.length, 'full size image'),
          'failed to convert'
        )
      }

      if (smallSizeFailures.length) {
        log.warning(
          pluralize(smallSizeFailures.length, 'small size image'),
          'failed to generate'
        )
      }

      if (fullSizeSuccesses.length) {
        log.text(
          pluralize(fullSizeSuccesses.length, 'full size image'),
          'converted'
        )
      }

      if (smallSizeSuccesses.length) {
        log.text(
          pluralize(smallSizeSuccesses.length, 'small size image'),
          'generated'
        )
      }

      log.text(bytesSaved, 'saved')
    } catch (processThumbnailError) {
      log.error('Failed to process thumbnails:', processThumbnailError)
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
