(() => {
  const file = document.getElementById('videoFile');
  const title = document.getElementById('videoTitle');
  const description = document.getElementById('videoDescription');
  const album = document.getElementById('videoAlbum');
  const button = document.getElementById('uploadVideo');
  const status = document.getElementById('videoUploadStatus');
  const progress = document.getElementById('uploadProgress');
  let clientId = '';
  let tokenClient = null;

  const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
  async function loadSetup() {
    try {
      const response = await fetch('/api/youtube-config', { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load video upload setup.');
      clientId = result.clientId || '';
    } catch (error) { status.textContent = error.message; }
    document.getElementById('setupWarning').classList.toggle('visible', !clientId);
    button.disabled = !clientId;
  }
  file.addEventListener('change', () => {
    const selected = file.files?.[0];
    document.getElementById('fileLabel').textContent = selected ? `${selected.name} · ${(selected.size / (1024 * 1024)).toFixed(1)} MB` : 'Choose a video from this device';
    if (selected && !title.value.trim()) title.value = selected.name.replace(/\.[^.]+$/, '').slice(0, 100);
  });
  function getGoogleToken() {
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) return reject(new Error('Google sign-in is still loading. Try again in a moment.'));
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope,
        callback: response => response?.access_token ? resolve(response.access_token) : reject(new Error(response?.error_description || response?.error || 'Google authorization did not finish.')),
        error_callback: error => reject(new Error(error.message || 'Google sign-in was closed.'))
      });
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    });
  }
  async function getYoutubeChannel(accessToken) {
    const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${accessToken}` } });
    const result = await response.json();
    if (!response.ok || !result.items?.length) throw new Error(result.error?.message || 'This Google account has no accessible YouTube channel.');
    return result.items[0];
  }
  function xhrRequest(url, method, accessToken, headers, body, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      Object.entries(headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, String(value)));
      if (onProgress) xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded, event.total); };
      xhr.onload = () => resolve(xhr);
      xhr.onerror = () => reject(new Error('The browser could not reach Google’s video upload service. Check the connection, account permissions, and try again.'));
      xhr.onabort = () => reject(new Error('The upload was cancelled.'));
      xhr.send(body);
    });
  }
  async function beginUpload(videoFile, videoTitle, videoDescription, token) {
    const response = await xhrRequest('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', 'POST', token, {
      'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': videoFile.size, 'X-Upload-Content-Type': videoFile.type || 'application/octet-stream'
    }, JSON.stringify({ snippet: { title: videoTitle, description: videoDescription, categoryId: '22' }, status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false } }));
    if (response.status < 200 || response.status >= 300) {
      let message = 'YouTube could not start the upload.';
      try { message = JSON.parse(response.responseText).error?.message || message; } catch {}
      throw new Error(message);
    }
    const uploadUrl = response.getResponseHeader('Location');
    if (!uploadUrl || !uploadUrl.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')) throw new Error('YouTube did not return a valid resumable upload link.');
    return uploadUrl;
  }
  async function uploadChunks(videoFile, uploadUrl, token) {
    const chunkBytes = 16 * 1024 * 1024;
    let offset = 0;
    let uploadedVideo = null;
    let recoveries = 0;
    while (offset < videoFile.size) {
      const end = Math.min(offset + chunkBytes, videoFile.size);
      const chunk = videoFile.slice(offset, end);
      let response;
      try {
        response = await xhrRequest(uploadUrl, 'PUT', token, { 'Content-Type': videoFile.type || 'application/octet-stream', 'Content-Range': `bytes ${offset}-${end - 1}/${videoFile.size}` }, chunk, loaded => {
          const total = offset + loaded;
          progress.value = Math.min(100, total / videoFile.size * 100);
          status.textContent = `Uploading… ${Math.floor(total / videoFile.size * 100)}%`;
        });
      } catch (error) {
        if (++recoveries > 3) throw new Error(`${error.message} Google could not resume this upload after three attempts.`);
        status.textContent = 'Connection interrupted. Resuming the video upload…';
        await new Promise(resolve => setTimeout(resolve, 700 * recoveries));
        let check;
        try { check = await xhrRequest(uploadUrl, 'PUT', token, { 'Content-Range': `bytes */${videoFile.size}` }, new Blob()); }
        catch { continue; }
        if (check.status >= 200 && check.status < 300) {
          try { uploadedVideo = JSON.parse(check.responseText); } catch {}
          if (uploadedVideo?.id) break;
        }
        if (check.status !== 308) {
          let message = `Google could not resume this video (HTTP ${check.status}).`;
          try { message = JSON.parse(check.responseText).error?.message || message; } catch {}
          throw new Error(message);
        }
        const accepted = check.getResponseHeader('Range')?.match(/bytes=0-(\d+)/i);
        offset = accepted ? Number(accepted[1]) + 1 : 0;
        progress.value = Math.min(100, offset / videoFile.size * 100);
        continue;
      }
      recoveries = 0;
      if (response.status === 308) { offset = end; continue; }
      if (response.status >= 200 && response.status < 300) { try { uploadedVideo = JSON.parse(response.responseText); } catch {} offset = end; break; }
      let message = `YouTube stopped the upload (HTTP ${response.status}).`;
      try { message = JSON.parse(response.responseText).error?.message || message; } catch {}
      throw new Error(message);
    }
    if (!uploadedVideo?.id) throw new Error('YouTube finished receiving the file but did not return its video ID.');
    return uploadedVideo;
  }

  button.addEventListener('click', async () => {
    const selected = file.files?.[0];
    if (!selected || !selected.type.startsWith('video/')) { await siteDialog.alert('Choose a video file first.'); return; }
    if (!title.value.trim()) { title.focus(); return; }
    button.disabled = true; progress.hidden = false; progress.value = 0;
    status.textContent = 'Choose the YouTube account to upload to…';
    try {
      const token = await getGoogleToken();
      const channel = await getYoutubeChannel(token);
      const channelName = channel.snippet?.title || 'YouTube channel';
      const channelHandle = channel.snippet?.customUrl || '';
      document.getElementById('selectedChannel').textContent = `Google channel: ${channelName}${channelHandle ? ` · ${channelHandle}` : ''}`;
      const expected = '@secretdino.ll27';
      const matches = channelHandle.toLowerCase().includes('secretdino.ll27');
      const approval = `Upload this as an unlisted video to ${channelName}${channelHandle ? ` (${channelHandle})` : ''}?${matches ? '' : '\n\nThis may not be the shared @secretdino.ll27 channel.'}`;
      if (!await siteDialog.confirm(approval)) { status.textContent = 'Upload cancelled.'; return; }
      status.textContent = 'Starting an Unlisted upload…';
      const uploadUrl = await beginUpload(selected, title.value.trim(), description.value.trim(), token);
      const uploaded = await uploadChunks(selected, uploadUrl, token);
      const saved = await fetch('/api/youtube-videos', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ videoId: uploaded.id, accessToken: token, album: album.value || 'General' }) });
      const result = await saved.json();
      if (!saved.ok) throw new Error(result.error || 'The video uploaded but we could not add it to our gallery.');
      status.textContent = 'Uploaded as Unlisted and added to our gallery ✨';
      title.value = ''; description.value = ''; file.value = '';
      document.getElementById('fileLabel').textContent = 'Choose a video from this device';
      if (window.refreshGalleryLibrary) await window.refreshGalleryLibrary();
      document.getElementById('videosTab').click();
    } catch (error) { status.textContent = error.message || 'The video upload failed.'; }
    finally { button.disabled = !clientId; }
  });
  loadSetup();
})();
