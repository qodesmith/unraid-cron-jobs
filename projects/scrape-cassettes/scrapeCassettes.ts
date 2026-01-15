import path from 'node:path'

import {chunkArray, invariant} from '@qodestack/utils'
import {load} from 'cheerio'

type FileData = {url: string; fileName: string}

const destination = Bun.env.DESTINATION
invariant(destination, '`DESTINATION` env var not set')

export async function scrapeCassettes() {
  const res = await fetch('http://www.tapedeck.org/archive.php')
  const html = await res.text()
  const $ = load(html)
  const data: FileData[] = []

  const imgNodes = $('.tape img')

  imgNodes.each((_i, el) => {
    const url = $(el).attr('src')

    if (url) {
      const {base} = path.parse(url)
      const cassetteUrl = url.replace('_thumb', '').replace('-thumb', '')
      const fileName = base.replace('_thumb', '').replace('-thumb', '')

      data.push({url: cassetteUrl, fileName})
    }
  })

  const chunkedData = chunkArray(data, 5)
  const errors: FileData[] = []
  const success: FileData[] = []
  const duplicates: FileData[] = []

  for (const items of chunkedData) {
    const promises = items.reduce<Promise<void>[]>((acc, item) => {
      const destinationPath = `${destination}/${item.fileName}`

      // Only download files we don't already have.
      if (Bun.file(destinationPath).size) {
        duplicates.push(item)
      } else {
        acc.push(downloadCassetteImage(item))
      }

      return acc
    }, [])

    const batchResults = await Promise.allSettled(promises)

    batchResults.forEach((res, i) => {
      const item = items[i]
      res.status === 'fulfilled' ? success.push(item) : errors.push(item)
    })
  }

  return {
    errors,
    success,
    itemsOnPage: imgNodes.length,
    itemsForDownload: data.length,
    duplicates,
  }
}

async function downloadCassetteImage({url, fileName}: FileData): Promise<void> {
  const res = await fetch(url)
  const arrayBuffer = await res.arrayBuffer()
  const destinationPath = `${destination}/${fileName}`

  return void Bun.write(destinationPath, arrayBuffer)
}
