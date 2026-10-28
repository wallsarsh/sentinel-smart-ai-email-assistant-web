import { createServer, type Server } from 'node:net'

export type SmtpScript = {
  /** Reply to RCPT TO (default 250). */
  rcpt?: string
  /** What to do after the end-of-data dot: a reply line, or 'drop' (close without answering) or 'hang' (never answer). */
  afterData?: string | 'drop' | 'hang'
  /** Reply to AUTH (default 235). */
  auth?: string
}

/** Minimal SMTP server that records every command; used to prove what goes over the wire. */
export async function fakeSmtp(script: SmtpScript = {}) {
  const commands: string[] = []
  const messages: string[] = []
  const sockets = new Set<import('node:net').Socket>()
  const server: Server = createServer((sock) => {
    sockets.add(sock)
    sock.on('close', () => sockets.delete(sock))
    sock.on('error', () => undefined)
    sock.write('220 fake ESMTP\r\n')
    let buf = ''
    let inData = false
    let data = ''
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      for (let i = buf.indexOf('\r\n'); i >= 0; i = buf.indexOf('\r\n')) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 2)
        if (inData) {
          if (line === '.') {
            inData = false
            messages.push(data)
            data = ''
            const a = script.afterData ?? '250 queued'
            if (a === 'drop') sock.destroy()
            else if (a !== 'hang') sock.write(`${a}\r\n`)
          } else data += `${line.startsWith('..') ? line.slice(1) : line}\r\n`
          continue
        }
        const cmd = line.split(' ')[0]!.toUpperCase()
        commands.push(cmd === 'MAIL' || cmd === 'RCPT' ? line : cmd)
        if (cmd === 'EHLO') sock.write('250-fake\r\n250 AUTH PLAIN LOGIN\r\n')
        else if (cmd === 'AUTH') sock.write(`${script.auth ?? '235 ok'}\r\n`)
        else if (cmd === 'RCPT') sock.write(`${script.rcpt ?? '250 ok'}\r\n`)
        else if (cmd === 'DATA') {
          inData = true
          sock.write('354 go\r\n')
        } else if (cmd === 'QUIT') {
          sock.write('221 bye\r\n')
          sock.end()
        } else sock.write('250 ok\r\n')
      }
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return {
    port: (server.address() as { port: number }).port,
    commands,
    messages,
    close: () =>
      new Promise<void>((r) => {
        sockets.forEach((s) => s.destroy())
        server.close(() => r())
      }),
  }
}
