/** Any /api path that is not a route is a JSON 404, not the app's HTML page (or its sign-in redirect). */
export default defineEventHandler(() => {
  throw createError({ statusCode: 404, statusMessage: 'not_found' })
})
