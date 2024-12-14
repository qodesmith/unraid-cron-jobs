import type {
  DownloadOptions,
  DownloadYouTubePlaylistOutput,
} from '@qodestack/dl-yt-playlist'
import {downloadYouTubePlaylist} from '@qodestack/dl-yt-playlist'
import {
  getLocalDate,
  invariant,
  createLogger,
  pluralize,
} from '@qodestack/utils'
import {timeZone} from '../../common/timeZone'
import {processThumbnails} from './processThumbnails'

type FinalResultsObj = Pick<
  DownloadYouTubePlaylistOutput,
  'youTubeFetchCount' | 'downloadCount' | 'failures'
> & {date: string; job: 'fullBeats' | 'beats'}

type ServerResponse =
  | {error: null; inserted: string[]; failedToParse: unknown[]}
  | {error: unknown; failedToParse: unknown[]}

export async function downloadYoutubeBeats({isFullJob}: {isFullJob: boolean}) {
  const log = createLogger({timeZone})

  try {
    const {
      playlistId,
      youTubeApiKey,
      directory,
      // downloadType,
      audioFormat,
      // videoFormat,
      downloadThumbnails,
      maxDurationSeconds,
      mostRecentItemsCount,
      silent,
      maxConcurrentYouTubeCalls,
      maxConcurrentYtdlpCalls,
      saveRawResponses,
    } = (() => {
      const {
        PLAYLIST_ID,
        YOUTUBE_API_KEY,
        DESTINATION,
        // DOWNLOAD_TYPE,
        AUDIO_FORMAT,
        // VIDEO_FORMAT,
      } = Bun.env
      invariant(PLAYLIST_ID, 'PLAYLIST_ID env var not found')
      invariant(YOUTUBE_API_KEY, 'YOUTUBE_API_KEY env var not found')
      invariant(AUDIO_FORMAT, 'AUDIO_FORMAT env var not found')
      invariant(DESTINATION, 'DESTINATION env var not found')
      // invariant(DOWNLOAD_TYPE, "DOWNLOAD_TYPE env var not found");

      return {
        playlistId: PLAYLIST_ID,
        youTubeApiKey: YOUTUBE_API_KEY,
        directory: DESTINATION,
        // downloadType: DOWNLOAD_TYPE as DownloadOptions["downloadType"],
        audioFormat: AUDIO_FORMAT,
        // videoFormat: VIDEO_FORMAT,
        downloadThumbnails: Bun.env.DOWNLOAD_THUMBNAILS === 'true',
        maxDurationSeconds: Bun.env.MAX_DURATION_SECONDS
          ? Number(Bun.env.MAX_DURATION_SECONDS)
          : undefined,
        mostRecentItemsCount: Bun.env.MOST_RECENT_ITEMS_COUNT
          ? Number(Bun.env.MOST_RECENT_ITEMS_COUNT)
          : undefined,
        silent: Bun.env.SILENT === 'true',
        maxConcurrentYouTubeCalls: Bun.env.MAX_CONCURRENT_YOUTUBE_CALLS
          ? Number(Bun.env.MAX_CONCURRENT_YOUTUBE_CALLS)
          : undefined,
        maxConcurrentYtdlpCalls: Bun.env.MAX_CONCURRENT_YTDLP_CALLS
          ? Number(Bun.env.MAX_CONCURRENT_YTDLP_CALLS)
          : undefined,
        saveRawResponses: Bun.env.SAVE_RAW_RESPONSES === 'true',
      }
    })()

    const serverUrl = Bun.env.BEATS_CONTAINER_URL

    const results = await downloadYouTubePlaylist({
      playlistId,
      youTubeApiKey,
      directory,
      downloadType: 'audio',
      getIdsForDownload: async ids => {
        const {idsForDownload}: {idsForDownload: string[]} = await fetch(
          `${serverUrl}/api/ids-for-download`,
          {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              email: Bun.env.EMAIL,
              password: Bun.env.PASSWORD,
              ids,
            }),
          }
        ).then(res => res.json())

        return idsForDownload
      },
      audioFormat,
      // videoFormat,
      downloadThumbnails,
      maxDurationSeconds,
      mostRecentItemsCount: isFullJob ? undefined : mostRecentItemsCount,
      silent,
      timeZone,
      maxConcurrentYtdlpCalls,
      maxConcurrentYouTubeCalls,
    })

    // THUMBNAILS - calculate various metadata, like bytes saved, etc.
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

      if (results.videosDownloaded.length) {
        log.text(bytesSaved, 'saved')
      }
    } catch (processThumbnailError) {
      log.error('Failed to process thumbnails:', processThumbnailError)
    }

    // YOUTUBE API RESPONSES - save these as json files.
    if (saveRawResponses) {
      const full = isFullJob ? '-full' : ''
      const playlistResponsePath = `${directory}/youtubePlaylistResponses${full}.json`
      const videosResponsePath = `${directory}/youtubeVideoResponses${full}.json`

      try {
        await Bun.write(
          playlistResponsePath,
          JSON.stringify(results.playlistItemListResponses, null, 2)
        )
      } catch (error) {
        log.error('Unable to write to', playlistResponsePath)
        log.error(error)
      }

      try {
        await Bun.write(
          videosResponsePath,
          JSON.stringify(results.videoListResponses, null, 2)
        )
      } catch (error) {
        log.error('Unable to write to', videosResponsePath)
        log.error(error)
      }
    }

    // RESULTS METADATA - save basic metadata about this job's results.
    const resultsFilePath = `${directory}/results.json`
    try {
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
        youTubeFetchCount: results.youTubeFetchCount,
        downloadCount: results.downloadCount,
        failures: results.failures,
      })

      await Bun.write(
        resultsFilePath,
        // Only keep 100 records.
        JSON.stringify(resultsList.slice(0, 100), null, 2)
      )
    } catch (error) {
      log.error('Failed to write results to', resultsFilePath)
      log.error(error)
    }

    // VIDEO METADATA - save the video metadata to the database.
    try {
      const res: ServerResponse = await fetch(`${serverUrl}/api/beats`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: Bun.env.EMAIL,
          password: Bun.env.PASSWORD,
          beats: results.videosDownloaded,
        }),
      }).then(res => res.json())

      const failedToParseLength = res.failedToParse.length

      if ('inserted' in res) {
        const insertedLength = res.inserted.length
        const beatsMsg = pluralize(insertedLength, 'beat')

        if (failedToParseLength) {
          log.warning(
            'Saved',
            beatsMsg,
            'but failed to parse',
            `${failedToParseLength}:`
          )
          log.warning(res.failedToParse)
        } else {
          log.success('Saved', beatsMsg)
        }
      } else {
        log.error('Saving beats failed:', res.error)

        if (failedToParseLength) {
          log.warning(
            'Failed to parse',
            `${pluralize(failedToParseLength, 'beat')}:`,
            res.failedToParse
          )
        }
      }
    } catch (error) {
      log.error(
        'Failed to save',
        pluralize(results.videosDownloaded.length, 'beat'),
        'to database'
      )
      log.error(error)
    }
  } catch (error) {
    log.error('Job failed:', error)
  }
}
