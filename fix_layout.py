with open('question-room-worker/index.js','r',encoding='utf-8') as f:
    content = f.read()
old = "const homeLayout = ['calm', 'doors'].includes(body.preferences?.homeLayout) ? body.preferences.homeLayout : 'calm';"
new = "const homeLayout = ['calm', 'doors', 'dyslexia-a', 'dyslexia-b', 'dyslexia-c', 'dyslexia-d', 'dyslexia-e'].includes(body.preferences?.homeLayout) ? body.preferences.homeLayout : 'calm';"
assert old in content, 'old not found'
content = content.replace(old, new)
with open('question-room-worker/index.js','w',encoding='utf-8') as f:
    f.write(content)
print('done')