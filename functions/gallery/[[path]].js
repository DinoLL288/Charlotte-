export async function onRequest() {
  return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
