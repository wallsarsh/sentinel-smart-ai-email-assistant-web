import { JSDOM } from 'jsdom'
import { setHtmlParser } from '../../../packages/core/src/prompts/text'

export * from '../../../packages/core/src/prompts/text'

setHtmlParser((html) => new JSDOM(html).window.document)
