import fs from 'node:fs'
import {invariant, log, pluralize} from '@qodestack/utils'

const backupLimit = Number(Bun.env.BACKUP_LIMIT ?? 4)
const destination = Bun.env.DESTINATION
invariant(destination, '`DESTINATION` env var not set')

export function pruneNotionBackups() {
  const items = fs
    .readdirSync(destination as string)
    .reduce<{dir: string; fileName: string; stats: fs.Stats}[]>((acc, item) => {
      if (item.endsWith('.zip')) {
        const dir = `${destination}/${item}`
        const stats = fs.statSync(dir)
        acc.push({dir, fileName: item, stats})
      }

      return acc
    }, [])
    .sort((a, b) => {
      return +b.stats.mtime - +a.stats.mtime
    })

  const itemsLength = items.length
  const itemsPluralized = pluralize(itemsLength, 'item')
  log.text(`Max ${pluralize(backupLimit, 'backup')}. Found ${itemsPluralized}.`)

  const itemsToDelete = items.slice(backupLimit)
  const itemsToDeleteLength = itemsToDelete.length

  itemsToDelete.forEach(({dir, fileName}) => {
    log.text(`Deleting ${fileName}.`)
    fs.rmSync(dir)
  })

  if (!itemsToDeleteLength) {
    log.text('No backups to delete!')
  } else {
    log.success(`Deleted ${pluralize(itemsToDeleteLength, 'file')}`)
  }
}
