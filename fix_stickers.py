with open('question-room-worker/index.js','r',encoding='utf-8') as f:
    content = f.read()
old = """  async getMoodData() {
    const all = await this.ctx.storage.get('moodData') || {};
    const result = {};
    for (const u of ['Charlotte', 'Luke']) {
      if (all[u]) Object.assign(result, all[u]);
    }
    return { moods: result };
  }
"""
new = old + """  async getStickerData(user) {
    const all = await this.ctx.storage.get('stickerData') || {};
    const owned = (all.owned && all.owned[user]) || [];
    const placements = (all.placements || []).filter(p => p.user === user);
    return { owned, placements };
  }

"""
assert old in content, 'old not found'
content = content.replace(old, new, 1)
with open('question-room-worker/index.js','w',encoding='utf-8') as f:
    f.write(content)
print('done')