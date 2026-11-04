// Tone presets for the compose-window assistant. Core tones stay the same; richer tones use an instruction.
export const TONES = [
  { id: 'standard', label: 'Standard', tone: 'professional', instruction: '' },
  { id: 'professional', label: 'Professional', tone: 'professional', instruction: '' },
  { id: 'friendly', label: 'Friendly', tone: 'friendly', instruction: '' },
  { id: 'concise', label: 'Concise', tone: 'concise', instruction: '' },
  { id: 'formal', label: 'Formal', tone: 'formal', instruction: '' },
  {
    id: 'creative',
    label: 'Creative',
    tone: 'professional',
    instruction:
      'Write with a fresh, engaging angle while staying clear and credible. Avoid clichés and hype.',
  },
  {
    id: 'casual',
    label: 'Casual',
    tone: 'friendly',
    instruction:
      'Write in a relaxed, conversational tone, as if replying to a trusted colleague. Keep it natural.',
  },
  {
    id: 'apologetic',
    label: 'Apologetic',
    tone: 'professional',
    instruction:
      'Open with a brief, sincere apology for the delay or mistake, then focus on the fix. Do not over-apologise.',
  },
  {
    id: 'persuasive',
    label: 'Persuasive',
    tone: 'professional',
    instruction:
      'Make a clear recommendation with the strongest relevant benefit and one concrete next step. Stay factual.',
  },
]

export const TONE_IDS = TONES.map((t) => t.id)

export const LENGTHS = [
  { id: 'short', label: 'Short', instruction: 'Keep it to two or three sentences.' },
  { id: 'standard', label: 'Standard', instruction: '' },
  {
    id: 'detailed',
    label: 'Detailed',
    instruction: 'Use two or three short paragraphs with a clear next step.',
  },
]

/** Request for the shared draft prompt. Unknown ids fall back to Standard. */
export function toneRequest(id, { intent = 'acknowledge', instruction = '' } = {}) {
  const preset = TONES.find((t) => t.id === id) ?? TONES[0]
  const extra = [preset.instruction, instruction.trim()].filter(Boolean).join(' ')
  return {
    tone: preset.tone,
    intent,
    ...(extra ? { instruction: extra } : {}),
  }
}

export const toneLabel = (id) => TONES.find((t) => t.id === id)?.label ?? 'Standard'

/** Compose request combining tone, intent, length and the user's own instruction. */
export function composeRequest({ tone = 'standard', intent = 'acknowledge', length = 'standard', instruction = '' } = {}) {
  const lengthInstruction = LENGTHS.find((l) => l.id === length)?.instruction ?? ''
  return toneRequest(tone, {
    intent,
    instruction: [lengthInstruction, instruction.trim()].filter(Boolean).join(' '),
  })
}
