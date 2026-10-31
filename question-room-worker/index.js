export class QuestionNightRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const sessionDate = url.searchParams.get('sessionDate') || '';

    if (url.pathname.endsWith('/state')) {
      return Response.json(await this.getState(sessionDate));
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'meta') {
      const user = url.searchParams.get('user');
      if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
      const data = await this.getQuestionData();
      const questionCounts = {
        Charlotte: data.questions.filter(item => item.author === 'Charlotte').length,
        Luke: data.questions.filter(item => item.author === 'Luke').length
      };
      return Response.json({
        questionSchedule: data.schedule,
        questionCounts,
        questionItems: data.questions.filter(item => item.author === user).map(item => ({ id: item.id, body: item.body, createdAt: item.createdAt })),
        questionSessions: Object.fromEntries(Object.entries(data.sessions).map(([key, value]) => [key, { questionIds: value.questionIds }]))
      });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'questions') {
      const requestedSession = url.searchParams.get('sessionDate') || '';
      if (!(await this.getState(requestedSession)).open) return Response.json({ error: 'Both people need to be online and ready before questions open' }, { status: 423 });
      const data = await this.getQuestionData();
      const session = data.sessions[requestedSession] || { questionIds: [], questions: {} };
      const questions = session.questionIds.map(id => {
        const saved = session.questions?.[id];
        const bankItem = data.questions.find(item => item.id === id);
        return { id, body: typeof saved === 'string' ? saved : (saved?.body || bankItem?.body || ''), author: (typeof saved === 'object' && saved?.author) || bankItem?.author || '' };
      }).filter(item => item.body);
      return new Response(JSON.stringify({ questions, questionSessions: { [requestedSession]: session }, questionResponses: { [requestedSession]: data.responses[requestedSession] || {} } }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'history') {
      const data = await this.getQuestionData();
      const sessions = Object.fromEntries(Object.entries(data.sessions).map(([date, session]) => {
        const questions = Object.fromEntries((session.questionIds || []).map(id => {
          const saved = session.questions?.[id];
          const bankItem = data.questions.find(item => item.id === id);
          return [id, { body: typeof saved === 'string' ? saved : (saved?.body || bankItem?.body || ''), author: (typeof saved === 'object' && saved?.author) || bankItem?.author || '' }];
        }));
        return [date, { questionIds: session.questionIds || [], questions }];
      }));
      return new Response(JSON.stringify({ questionSessions: sessions, questionResponses: data.responses }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
    }

    if (request.method === 'POST') return this.mutateQuestions(request);

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }

    const user = url.searchParams.get('user');
    if (!['Charlotte', 'Luke'].includes(user)) return new Response('Unknown room member', { status: 403 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return new Response('Invalid question session', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ user, sessionDate });
    this.ctx.acceptWebSocket(server);

    const ready = await this.ctx.storage.get(`ready:${sessionDate}`) || {};
    ready[user] = false;
    await this.ctx.storage.put(`ready:${sessionDate}`, ready);
    await this.broadcast(sessionDate);
    return new Response(null, { status: 101, webSocket: client });
  }

  async getQuestionData() {
    return await this.ctx.storage.get('questionData') || { schedule: null, questions: [], sessions: {}, responses: {} };
  }

  async mutateQuestions(request) {
    try {
      const body = await request.json();
      const data = await this.getQuestionData();
      if (body.action === 'configure') {
        const day = Number(body.day);
        if (!Number.isInteger(day) || day < 0 || day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.openTime || ''))) return Response.json({ error: 'Choose a valid opening day and time' }, { status: 400 });
        data.schedule = { day, time: body.openTime, configuredAt: new Date().toISOString() };
      } else if (body.action === 'add') {
        const text = typeof body.question === 'string' ? body.question.trim().slice(0, 300) : '';
        const author = body.author;
        if (!text || !['Charlotte', 'Luke'].includes(author)) return Response.json({ error: 'Write a question for your partner' }, { status: 400 });
        if (data.questions.length >= 500) return Response.json({ error: 'The question bank is full' }, { status: 400 });
        data.questions.unshift({ id: crypto.randomUUID(), body: text, author, recipient: author === 'Charlotte' ? 'Luke' : 'Charlotte', createdAt: new Date().toISOString() });
      } else if (body.action === 'delete') {
        const index = data.questions.findIndex(item => item.id === body.id);
        if (index < 0) return Response.json({ error: 'Question not found' }, { status: 404 });
        if (data.questions[index].author !== body.author) return Response.json({ error: 'You can only remove questions you wrote' }, { status: 403 });
        data.questions.splice(index, 1);
      } else if (body.action === 'draw') {
        const date = String(body.sessionDate || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(await this.getState(date)).open) return Response.json({ error: 'Both people need to be online and ready first' }, { status: 423 });
        const session = data.sessions[date] || { questionIds: [], questions: {} };
        session.questions = session.questions || {};
        const pool = {
          Charlotte: data.questions.filter(item => item.author === 'Charlotte' && !session.questionIds.includes(item.id)),
          Luke: data.questions.filter(item => item.author === 'Luke' && !session.questionIds.includes(item.id))
        };
        const initialRound = !session.questionIds.length;
        const perPerson = initialRound ? 3 : 1;
        if (initialRound && (pool.Charlotte.length < 3 || pool.Luke.length < 3)) return Response.json({ error: 'Each person needs at least three questions before you start' }, { status: 400 });
        if (!initialRound && (!pool.Charlotte.length || !pool.Luke.length)) return Response.json({ error: 'You both need another unused question before drawing a pair' }, { status: 400 });
        const selected = ['Charlotte', 'Luke'].flatMap(author => pool[author].sort(() => Math.random() - .5).slice(0, Math.min(perPerson, pool[author].length)));
        if (!selected.length) return Response.json({ error: 'There are no unused questions left for this night' }, { status: 400 });
        selected.forEach(item => { session.questionIds.push(item.id); session.questions[item.id] = { body: item.body, author: item.author }; });
        data.sessions[date] = session;
      } else if (body.action === 'answer') {
        const date = String(body.sessionDate || ''), questionId = String(body.questionId || '');
        if (!(await this.getState(date)).open) return Response.json({ error: 'Both people need to be online and ready first' }, { status: 423 });
        const session = data.sessions[date];
        if (!session?.questionIds.includes(questionId)) return Response.json({ error: 'Question session not found' }, { status: 404 });
        const savedQuestion = session.questions?.[questionId];
        const questionAuthor = (typeof savedQuestion === 'object' && savedQuestion?.author) || data.questions.find(item => item.id === questionId)?.author;
        const author = body.author, answer = typeof body.response === 'string' ? body.response.trim().slice(0, 1200) : '';
        if (!answer || !['Charlotte', 'Luke'].includes(author)) return Response.json({ error: 'Write an answer first' }, { status: 400 });
        if (questionAuthor && author === questionAuthor) return Response.json({ error: 'The person who wrote the question asks it; their partner answers' }, { status: 403 });
        data.responses[date] = data.responses[date] || {};
        data.responses[date][questionId] = data.responses[date][questionId] || {};
        data.responses[date][questionId][author] = { text: answer, answeredAt: new Date().toISOString() };
      } else return Response.json({ error: 'Unknown question-room action' }, { status: 400 });

      await this.ctx.storage.put('questionData', data);
      await this.broadcastRefresh();
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json({ error: error.message || 'Could not save the question room' }, { status: 500 });
    }
  }

  async webSocketMessage(socket, message) {
    let payload;
    try { payload = JSON.parse(message); } catch { return; }
    const attachment = socket.deserializeAttachment();
    if (!attachment) return;
    if (payload.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
      await this.broadcastMusic();
      return;
    }
    if (payload.type === 'ready') {
      const ready = await this.ctx.storage.get(`ready:${attachment.sessionDate}`) || {};
      ready[attachment.user] = Boolean(payload.ready);
      await this.ctx.storage.put(`ready:${attachment.sessionDate}`, ready);
      await this.broadcast(attachment.sessionDate);
    }
    if (payload.type === 'music') {
      const music = {
        trackId: String(payload.trackId || ''),
        position: Math.max(0, Number(payload.position) || 0),
        paused: Boolean(payload.paused),
        updatedAt: Date.now()
      };
      await this.ctx.storage.put('sharedMusic', music);
      await this.broadcastMusic();
    }
    if (payload.type === 'spotify-playlist') {
      let playlist = '';
      try {
        const url = new URL(String(payload.url || ''));
        const match = url.hostname === 'open.spotify.com' && url.pathname.match(/^\/playlist\/([A-Za-z0-9]+)\/?$/);
        if (match) playlist = `https://open.spotify.com/playlist/${match[1]}`;
      } catch { /* invalid playlist link */ }
      if (playlist) {
        await this.ctx.storage.put('spotifyPlaylist', playlist);
        await this.broadcastSpotifyPlaylist(playlist);
      }
    }
    if (payload.type === 'refresh') {
      await this.broadcast(attachment.sessionDate);
      await this.broadcastRefresh();
    }
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment();
    if (!attachment) return;
    const ready = await this.ctx.storage.get(`ready:${attachment.sessionDate}`) || {};
    ready[attachment.user] = false;
    await this.ctx.storage.put(`ready:${attachment.sessionDate}`, ready);
    await this.broadcast(attachment.sessionDate);
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }

  async getState(sessionDate) {
    const online = new Set();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment && attachment.sessionDate === sessionDate) online.add(attachment.user);
    }
    const ready = await this.ctx.storage.get(`ready:${sessionDate}`) || {};
    const bothOnline = online.has('Charlotte') && online.has('Luke');
    const open = bothOnline && ready.Charlotte === true && ready.Luke === true;
    const music = await this.ctx.storage.get('sharedMusic') || { trackId: '', position: 0, paused: true, updatedAt: Date.now() };
    const spotifyPlaylist = await this.ctx.storage.get('spotifyPlaylist') || '';
    return { type: 'state', sessionDate, online: [...online], ready, open, music, spotifyPlaylist };
  }

  async broadcast(sessionDate) {
    const state = JSON.stringify(await this.getState(sessionDate));
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment && attachment.sessionDate === sessionDate) {
        try { socket.send(state); } catch { /* closed socket */ }
      }
    }
  }

  async broadcastMusic() {
    const music = await this.ctx.storage.get('sharedMusic');
    const message = JSON.stringify({ type: 'music', music });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* closed socket */ }
    }
  }

  async broadcastSpotifyPlaylist(url) {
    const message = JSON.stringify({ type: 'spotify-playlist', url });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* closed socket */ }
    }
  }

  async broadcastRefresh() {
    const message = JSON.stringify({ type: 'refresh' });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* closed socket */ }
    }
  }
}

export default {
  async fetch(request, env) {
    const id = env.QUESTION_ROOM.idFromName('charlotte-question-night');
    return env.QUESTION_ROOM.get(id).fetch(request);
  }
};
