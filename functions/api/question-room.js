export async function onRequest(context) {
  const { env, request } = context;
  if (!env.QUESTION_ROOM) {
    return new Response(JSON.stringify({ error: 'Live question room is not configured yet' }), {
      status: 503,
      headers: { 'content-type': 'application/json' }
    });
  }
  const id = env.QUESTION_ROOM.idFromName('charlotte-question-night');
  return env.QUESTION_ROOM.get(id).fetch(request);
}
