with open('question-room-worker/index.js','r',encoding='utf-8') as f:
    content = f.read()
old = "  async getPlayfulState() {\n    const state = await this.ctx.storage.get('playfulState') || {};\n    return {\n      tokens: { Charlotte: 0, Luke: 0, ...(state.tokens || {}) },\n      finds: Array.isArray(state.finds) ? state.finds : []\n    };\n  }\n"
new = old + "  async getMoodData() {\n    const all = await this.ctx.storage.get('moodData') || {};\n    const result = {};\n    for (const u of ['Charlotte', 'Luke']) {\n      if (all[u]) Object.assign(result, all[u]);\n    }\n    return { moods: result };\n  }\n\n"
assert old in content, 'old not found'
content = content.replace(old, new, 1)
with open('question-room-worker/index.js','w',encoding='utf-8') as f:
    f.write(content)
print('done')