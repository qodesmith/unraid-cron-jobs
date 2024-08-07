import type {Video} from '@qodestack/dl-yt-playlist'
import fs from 'node:fs'
import {$} from 'bun'
import {bytesToSize} from '@qodestack/utils'

/**
 * Uses the imagemagick library to convert the fullsize thumbnail jpg's into
 * 40x40 sized versions. Imagemagick is installed via the Dockerfile.
 *
 * Docker is installing v6.x, which uses the `convert` command. v7.x uses the
 * `magick` command instead.
 *
 * https://imagemagick.org/
 */
export async function processThumbnails({
  directory,
  videosDownloaded,
}: {
  directory: string
  videosDownloaded: Video[]
}) {
  const smallSizeFailures: string[] = []
  const smallSizeSuccesses: string[] = []
  const notFound: string[] = []
  const fullSizeSuccesses: string[] = []
  const fullSizeFailures: string[] = []
  const alreadyExist: {thumbnail: string; small: string}[] = []
  let totalBytesSaved = 0

  for (const video of videosDownloaded) {
    const {id} = video
    const imagePath = `${directory}/thumbnails/${id}.jpg`
    const smallImagePath = `${directory}/thumbnails/${id}[small].jpg`

    if (!fs.existsSync(imagePath)) {
      notFound.push(id)
      continue
    }

    if (fs.existsSync(smallImagePath)) {
      alreadyExist.push({thumbnail: imagePath, small: smallImagePath})
      continue
    }

    // Reduce full size images to 80% quality (overwrite the file).
    const bytesBefore = Bun.file(imagePath).size
    const fullSizeRes =
      await $`convert ${imagePath} -quality 80 ${imagePath}`.nothrow()
    if (fullSizeRes.exitCode !== 0) {
      fullSizeFailures.push(id)
    } else {
      totalBytesSaved += bytesBefore - Bun.file(imagePath).size
      fullSizeSuccesses.push(id)
    }

    // Create 40x40 versions of the images.
    const smallSizeRes =
      await $`convert ${imagePath} -resize 40x40^ -gravity center -extent 40x40 ${smallImagePath}`.nothrow()
    if (smallSizeRes.exitCode !== 0) {
      smallSizeFailures.push(id)
    } else {
      smallSizeSuccesses.push(id)
    }
  }

  return {
    smallSizeFailures,
    smallSizeSuccesses,
    notFound,
    fullSizeSuccesses,
    fullSizeFailures,
    alreadyExist,
    bytesSaved: bytesToSize(totalBytesSaved),
  }
}
