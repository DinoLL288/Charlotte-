const DEFAULT_SPOTIFY_PLAYLIST = 'https://open.spotify.com/playlist/0nd5Ut2ixgw4RfV0EfQHwx';

const TRUTH_DARE_PROMPTS = {
  text: {
    truth: [
      'What tiny thing I do always makes you smile?', 'What song feels a little like us?', 'What is a small moment together you wish you could replay?',
      'What is something you would love us to try on our next date?', 'What is your favorite way for me to show I care?', 'What silly thing are you secretly very good at?',
      'What is one thing you have been looking forward to lately?', 'Which photo of us makes you happiest, and why?', 'What is a cozy evening together in your imagination?',
      'What is something you appreciate about how we talk to each other?', 'What snack would you pick for our perfect movie night?', 'What is a little dream you would like us to make time for?'
    ],
    dare: [
      'Send me a photo of something nearby that matches your mood.', 'Write me a three-line love note using three emojis I choose.', 'Send a voice note saying one kind thing about yourself.',
      'Pick a song for us and send me the link with a one-sentence review.', 'Draw a tiny picture of our ideal date and send it.', 'Send me your best dramatic reaction to an imaginary plot twist.',
      'Make up a two-line theme song for us and type it out.', 'Choose a color; send me three things around you in that color.', 'Send me a wholesome meme that feels like us.',
      'Give our next date a movie title and a tagline.', 'Send a voice note reading a very ordinary sentence like a movie trailer.', 'Invent a ridiculous award and tell me what I win it for.'
    ]
  },
  call: {
    truth: [
      'What was your first impression of me?', 'What small thing helps you feel cared for when we are apart?', 'What is one favorite memory from one of our calls?',
      'What would you like more of in our time together?', 'What is a place you would enjoy exploring with me?', 'What is something new you learned about yourself recently?',
      'What kind of date feels most relaxing to you?', 'What is something about us that makes you proud?', 'What is one thing you would like me to ask you more often?',
      'Which shared memory makes you laugh the most?', 'What is a comfort show, game, or song you would share with me?', 'What is one small goal you would like us to cheer each other on with?'
    ],
    dare: [
      'Give me your best impression of a sleepy cat for five seconds.', 'Hum a song and let me guess it.', 'Describe your favorite snack like a fancy restaurant critic.',
      'Show me an object nearby and make up its dramatic backstory.', 'Say something sweet about yourself in your most confident voice.', 'Make up a silly handshake using only words and sound effects.',
      'Tell a tiny story about our next adventure in three sentences.', 'Do your best game-show host introduction for me.', 'Pick an emoji and explain why it is today’s official us emoji.',
      'Invent a new holiday for us and describe how we celebrate it.', 'Try to make me laugh using only a very serious voice.', 'Give a 10-second tour of one favorite thing in your room, if you feel comfortable.'
    ]
  }
};

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

    if (request.method === 'GET' && url.searchParams.get('view') === 'bathroom') {
      return Response.json(await this.getBathroomData(), { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'truth-dare') {
      const user = url.searchParams.get('user');
      if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
      return Response.json(await this.getTruthDareView(user), { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'preferences') {
      const user = url.searchParams.get('user');
      if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
      return Response.json(await this.getPreferences(user), { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'questions') {
      const requestedSession = url.searchParams.get('sessionDate') || '';
      if (!(await this.getState(requestedSession)).open) return Response.json({ error: 'We both need to be online and ready before our questions open' }, { status: 423 });
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

  async getBathroomData() {
    return await this.ctx.storage.get('bathroomData') || { status: {}, events: [] };
  }

  async getTruthDareData() {
    return await this.ctx.storage.get('truthDareData') || {
      rules: { maxDaresInRow: 3, dareAfterTruths: 5 },
      customPrompts: [], usedPrompts: [], history: [],
      stats: { lastType: '', dareStreak: 0, truthsSinceDare: 0 }
    };
  }

  async getTruthDareView(user, storedData = null) {
    const data = storedData || await this.getTruthDareData();
    const online = (await this.getState('2000-01-02')).online;
    const bothOnline = online.includes('Charlotte') && online.includes('Luke');
    return {
      ...data,
      customPrompts: data.customPrompts.filter(item => item.author === user),
      current: bothOnline ? data.current || null : null
    };
  }

  async getPreferences(user) {
    const preferences = await this.ctx.storage.get('profilePreferences') || {};
    return {
      theme: 'blue', accent: '#347fa3',
      reminderLeadDays: 1, reminderTime: '09:00', textSize: 'normal',
      reducedMotion: false, compactLayout: false, showReactions: true, showPresence: true,
      ...(preferences[user] || {}), birthdayReminders: true
    };
  }

  async mutateQuestions(request) {
    try {
      const body = await request.json();
      if (body.action === 'truth-dare') return this.mutateTruthDare(body);
      if (body.action === 'preferences') {
        const user = body.user;
        if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
        const allowedThemes = ['blue', 'midnight', 'lavender', 'sage', 'sunset'];
        const theme = allowedThemes.includes(body.preferences?.theme) ? body.preferences.theme : '';
        const accent = /^#[0-9a-fA-F]{6}$/.test(String(body.preferences?.accent || '')) ? body.preferences.accent : '';
        const reminderLeadDays = Number(body.preferences?.reminderLeadDays);
        const reminderTime = String(body.preferences?.reminderTime || '');
        const textSize = ['normal', 'large'].includes(body.preferences?.textSize) ? body.preferences.textSize : '';
        if (!theme || !accent || ![0, 1, 3, 7, 14].includes(reminderLeadDays) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime) || !textSize) return Response.json({ error: 'Choose a valid theme, accent, text size, and reminder time.' }, { status: 400 });
        const all = await this.ctx.storage.get('profilePreferences') || {};
        all[user] = {
          theme, accent, birthdayReminders: true, reminderLeadDays, reminderTime, textSize,
          reducedMotion: Boolean(body.preferences?.reducedMotion), compactLayout: Boolean(body.preferences?.compactLayout),
          showReactions: body.preferences?.showReactions !== false, showPresence: body.preferences?.showPresence !== false
        };
        await this.ctx.storage.put('profilePreferences', all);
        await this.broadcastRefresh();
        return Response.json({ ok: true, preferences: all[user] });
      }
      const data = await this.getQuestionData();
      if (body.action === 'bathroom') {
        const user = body.user;
        if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose our own profile to save a check-in' }, { status: 403 });
        const bathroom = await this.getBathroomData();
        const active = Boolean(body.active);
        const previous = bathroom.status[user] || { active: false };
        if (Boolean(previous.active) !== active) {
          const at = new Date().toISOString();
          bathroom.status[user] = active ? { active: true, startedAt: at } : { active: false, startedAt: null, returnedAt: at };
          bathroom.events.unshift({ id: crypto.randomUUID(), user, action: active ? 'start' : 'return', at });
          bathroom.events = bathroom.events.slice(0, 250);
          await this.ctx.storage.put('bathroomData', bathroom);
          await this.broadcastBathroom(bathroom);
        }
        return Response.json({ ok: true, bathroom });
      } else if (body.action === 'bathroom-history') {
        const user = body.user;
        const action = body.eventAction === 'return' ? 'return' : body.eventAction === 'start' ? 'start' : '';
        const at = new Date(body.at || '');
        if (!['Charlotte', 'Luke'].includes(user) || !action || Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60 * 1000 || at.getTime() < Date.now() - 10 * 365 * 24 * 60 * 60 * 1000) {
          return Response.json({ error: 'Choose whether we stepped away or came back, and enter a valid recent date and time.' }, { status: 400 });
        }
        const bathroom = await this.getBathroomData();
        bathroom.events.unshift({ id: crypto.randomUUID(), user, action, at: at.toISOString(), addedLater: true });
        bathroom.events.sort((a, b) => new Date(b.at) - new Date(a.at));
        bathroom.events = bathroom.events.slice(0, 250);
        await this.ctx.storage.put('bathroomData', bathroom);
        await this.broadcastBathroom(bathroom);
        return Response.json({ ok: true, bathroom });
      } else if (body.action === 'configure') {
        const day = Number(body.day);
        if (!Number.isInteger(day) || day < 0 || day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.openTime || ''))) return Response.json({ error: 'Choose a valid opening day and time' }, { status: 400 });
        data.schedule = { day, time: body.openTime, configuredAt: new Date().toISOString() };
      } else if (body.action === 'add') {
        const text = typeof body.question === 'string' ? body.question.trim().slice(0, 300) : '';
        const author = body.author;
        if (!text || !['Charlotte', 'Luke'].includes(author)) return Response.json({ error: 'Write a question for our next night' }, { status: 400 });
        if (data.questions.length >= 500) return Response.json({ error: 'The question bank is full' }, { status: 400 });
        data.questions.unshift({ id: crypto.randomUUID(), body: text, author, recipient: author === 'Charlotte' ? 'Luke' : 'Charlotte', createdAt: new Date().toISOString() });
      } else if (body.action === 'delete') {
        const index = data.questions.findIndex(item => item.id === body.id);
        if (index < 0) return Response.json({ error: 'Question not found' }, { status: 404 });
        if (data.questions[index].author !== body.author) return Response.json({ error: 'That question belongs to the other person’s private list' }, { status: 403 });
        data.questions.splice(index, 1);
      } else if (body.action === 'draw') {
        const date = String(body.sessionDate || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(await this.getState(date)).open) return Response.json({ error: 'We both need to be online and ready first' }, { status: 423 });
        const session = data.sessions[date] || { questionIds: [], questions: {} };
        session.questions = session.questions || {};
        const pool = {
          Charlotte: data.questions.filter(item => item.author === 'Charlotte' && !session.questionIds.includes(item.id)),
          Luke: data.questions.filter(item => item.author === 'Luke' && !session.questionIds.includes(item.id))
        };
        const initialRound = !session.questionIds.length;
        const perPerson = initialRound ? 3 : 1;
        if (initialRound && (pool.Charlotte.length < 3 || pool.Luke.length < 3)) return Response.json({ error: 'We each need at least three questions before we start' }, { status: 400 });
        if (!initialRound && (!pool.Charlotte.length || !pool.Luke.length)) return Response.json({ error: 'We each need another unused question before drawing a pair' }, { status: 400 });
        const selected = ['Charlotte', 'Luke'].flatMap(author => pool[author].sort(() => Math.random() - .5).slice(0, Math.min(perPerson, pool[author].length)));
        if (!selected.length) return Response.json({ error: 'There are no unused questions left for this night' }, { status: 400 });
        selected.forEach(item => { session.questionIds.push(item.id); session.questions[item.id] = { body: item.body, author: item.author }; });
        data.sessions[date] = session;
      } else if (body.action === 'answer') {
        const date = String(body.sessionDate || ''), questionId = String(body.questionId || '');
        if (!(await this.getState(date)).open) return Response.json({ error: 'We both need to be online and ready first' }, { status: 423 });
        const session = data.sessions[date];
        if (!session?.questionIds.includes(questionId)) return Response.json({ error: 'Question session not found' }, { status: 404 });
        const savedQuestion = session.questions?.[questionId];
        const questionAuthor = (typeof savedQuestion === 'object' && savedQuestion?.author) || data.questions.find(item => item.id === questionId)?.author;
        const author = body.author, answer = typeof body.response === 'string' ? body.response.trim().slice(0, 1200) : '';
        if (!answer || !['Charlotte', 'Luke'].includes(author)) return Response.json({ error: 'Add an answer before saving it' }, { status: 400 });
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

  async mutateTruthDare(body) {
    const data = await this.getTruthDareData();
    const user = ['Charlotte', 'Luke'].includes(body.user) ? body.user : '';
    if (!user) return Response.json({ error: 'Choose our own profile first' }, { status: 400 });
    if (body.operation === 'rules') {
      const maxDaresInRow = Number(body.rules?.maxDaresInRow);
      const dareAfterTruths = Number(body.rules?.dareAfterTruths);
      if (!Number.isInteger(maxDaresInRow) || maxDaresInRow < 1 || maxDaresInRow > 10 || !Number.isInteger(dareAfterTruths) || dareAfterTruths < 1 || dareAfterTruths > 20) {
        return Response.json({ error: 'Rules must be between 1 and 10 dares in a row, and 1 and 20 truths between dares.' }, { status: 400 });
      }
      data.rules = { maxDaresInRow, dareAfterTruths };
    } else if (body.operation === 'add-prompt') {
      const prompt = String(body.prompt || '').trim().slice(0, 300);
      const type = body.promptType === 'dare' ? 'dare' : body.promptType === 'truth' ? 'truth' : '';
      const mode = ['text', 'call', 'both'].includes(body.mode) ? body.mode : '';
      if (!prompt || !type || !mode) return Response.json({ error: 'Add a truth or dare and choose text, call, or both.' }, { status: 400 });
      if (data.customPrompts.length >= 300) return Response.json({ error: 'Our custom prompt list is full.' }, { status: 400 });
      data.customPrompts.unshift({ id: crypto.randomUUID(), prompt, type, mode, author: user, assignedTo: user === 'Charlotte' ? 'Luke' : 'Charlotte', createdAt: new Date().toISOString() });
    } else if (body.operation === 'remove-prompt') {
      const index = data.customPrompts.findIndex(item => item.id === body.id);
      if (index < 0) return Response.json({ error: 'Custom prompt not found.' }, { status: 404 });
      if (data.customPrompts[index].author !== user) return Response.json({ error: 'Only the person who added a prompt can remove it.' }, { status: 403 });
      data.customPrompts.splice(index, 1);
    } else if (body.operation === 'draw') {
      const mode = ['text', 'call', 'both'].includes(body.mode) ? body.mode : '';
      const type = body.promptType === 'dare' ? 'dare' : body.promptType === 'truth' ? 'truth' : '';
      if (!mode || !type) return Response.json({ error: 'Choose text, call, or both, then truth or dare.' }, { status: 400 });
      const online = (await this.getState('2000-01-02')).online;
      if (!online.includes('Charlotte') || !online.includes('Luke')) return Response.json({ error: 'We both need to be online before we draw a prompt.' }, { status: 423 });
      const { maxDaresInRow, dareAfterTruths } = data.rules;
      if (type === 'dare' && data.stats.dareStreak >= maxDaresInRow) return Response.json({ error: `Let’s do a truth before another dare (our limit is ${maxDaresInRow} dares in a row).` }, { status: 409 });
      if (type === 'truth' && data.stats.truthsSinceDare >= dareAfterTruths) return Response.json({ error: `Our rule says to choose at least one dare every ${dareAfterTruths} truths.` }, { status: 409 });
      const modes = mode === 'both' ? ['text', 'call'] : [mode];
      const presets = modes.flatMap(promptMode => TRUTH_DARE_PROMPTS[promptMode][type].map((prompt, index) => ({ id: `preset-${promptMode}-${type}-${index}`, prompt, type, mode: promptMode, preset: true })));
      const pool = [...data.customPrompts.filter(item => item.type === type && (item.assignedTo === user || (!item.assignedTo && item.author !== user)) && (mode === 'both' || item.mode === 'both' || item.mode === mode)), ...presets];
      let available = pool.filter(item => !data.usedPrompts.includes(item.id));
      if (!available.length) {
        const ids = new Set(pool.map(item => item.id));
        data.usedPrompts = data.usedPrompts.filter(id => !ids.has(id));
        available = pool;
      }
      const selected = available[Math.floor(Math.random() * available.length)];
      if (!selected) return Response.json({ error: 'No prompts found for that choice.' }, { status: 404 });
      data.usedPrompts.push(selected.id);
      data.stats.lastType = type;
      data.stats.dareStreak = type === 'dare' ? data.stats.dareStreak + 1 : 0;
      data.stats.truthsSinceDare = type === 'truth' ? data.stats.truthsSinceDare + 1 : 0;
      data.history.unshift({ id: crypto.randomUUID(), promptId: selected.id, prompt: selected.prompt, type, mode: selected.mode, by: user, assignedTo: user, addedBy: selected.author || '', source: selected.preset ? 'preset' : 'custom', at: new Date().toISOString() });
      data.history = data.history.slice(0, 100);
      data.current = data.history[0];
    } else if (body.operation === 'clear-current') {
      data.current = null;
    } else return Response.json({ error: 'Unknown Truth or Dare action.' }, { status: 400 });

    await this.ctx.storage.put('truthDareData', data);
    await this.broadcastRefresh();
    return Response.json({ ok: true, data: await this.getTruthDareView(user, data) });
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
    if (payload.type === 'reaction') {
      const emoji = String(payload.emoji || '').slice(0, 12);
      if (emoji) await this.broadcastReaction({ type: 'reaction', emoji, user: attachment.user, id: crypto.randomUUID(), sentAt: Date.now() });
    }
    if (payload.type === 'music') {
      const music = {
        trackId: String(payload.trackId || ''),
        position: Math.max(0, Number(payload.position) || 0),
        paused: Boolean(payload.paused),
        user: attachment.user,
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
    if (payload.type === 'spotify-play-request') {
      await this.broadcastSpotifyPlayback({ type: 'spotify-play-request', user: attachment.user });
    }
    if (payload.type === 'spotify-playback') {
      const music = {
        trackId: String(payload.track || '').slice(0, 200),
        position: Math.min(86400, Math.max(0, Number(payload.position) || 0)),
        paused: !Boolean(payload.playing),
        user: attachment.user,
        updatedAt: Date.now()
      };
      await this.ctx.storage.put('sharedMusic', music);
      await this.broadcastSpotifyPlayback({
        type: 'spotify-playback',
        ...music,
        playing: !music.paused,
        track: music.trackId
      });
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
    const music = await this.ctx.storage.get('sharedMusic') || { trackId: '', position: 0, paused: true, user: '', updatedAt: Date.now() };
    const spotifyPlaylist = await this.ctx.storage.get('spotifyPlaylist') || DEFAULT_SPOTIFY_PLAYLIST;
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

  async broadcastSpotifyPlayback(state) {
    const message = JSON.stringify(state);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* closed socket */ }
    }
  }

  async broadcastBathroom(bathroom) {
    const message = JSON.stringify({ type: 'bathroom', bathroom });
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

  async broadcastReaction(reaction) {
    const message = JSON.stringify(reaction);
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
