export type SseEvent = { event?: string; data: string; id?: string }

/**
 * Parses a Server-Sent Events byte stream. Safe for arbitrary chunking: lines
 * and multi-byte UTF-8 characters may be split across chunks. Handles LF, CRLF
 * and CR line endings, comments, multi-line data, and a final event without a
 * trailing blank line.
 */
export async function* parseSse(
  chunks: AsyncIterable<Uint8Array>,
): AsyncGenerator<SseEvent, void, void> {
  const dec = new TextDecoder('utf-8')
  let buf = ''
  let event: string | undefined
  let id: string | undefined
  let data: string[] = []
  let skipLf = false

  const flush = (): SseEvent | null => {
    const out = data.length ? { event, data: data.join('\n'), id } : null
    event = undefined
    id = undefined
    data = []
    return out
  }
  const line = (l: string): SseEvent | null => {
    if (l === '') return flush()
    if (l.startsWith(':')) return null
    const i = l.indexOf(':')
    const field = i < 0 ? l : l.slice(0, i)
    let value = i < 0 ? '' : l.slice(i + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') data.push(value)
    else if (field === 'event') event = value
    else if (field === 'id') id = value
    return null
  }

  for await (const chunk of chunks) {
    buf += dec.decode(chunk, { stream: true })
    let start = 0
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i]
      if (skipLf) {
        skipLf = false
        if (c === '\n') {
          start = i + 1
          continue
        }
      }
      if (c === '\n' || c === '\r') {
        const ev = line(buf.slice(start, i))
        start = i + 1
        if (c === '\r') {
          if (buf[i + 1] === '\n') {
            i++
            start = i + 1
          } else if (i + 1 === buf.length) skipLf = true
        }
        if (ev) yield ev
      }
    }
    buf = buf.slice(start)
  }
  buf += dec.decode()
  if (buf) {
    const ev = line(buf)
    if (ev) yield ev
  }
  const last = flush()
  if (last) yield last
}
