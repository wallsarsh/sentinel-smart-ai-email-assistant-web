import { desktopMode } from '../../config/index'
/** Signals locally packaged standalone mode without leaking secrets. */
export default defineEventHandler(() => ({
  standalone: desktopMode(),
}))
