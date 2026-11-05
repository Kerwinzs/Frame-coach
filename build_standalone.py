#!/usr/bin/env python3
"""Bundle the offline experience into one portable HTML file (standard library)."""
import base64
from pathlib import Path
root = Path(__file__).resolve().parent
html = (root / 'dist/index.html').read_text()
css = (root / 'dist/style.css').read_text()
modules = ['core.mjs', 'aesthetics.mjs', 'aesthetics-view.mjs']
def inline_source(name):
    return '\n'.join(line for line in (root / 'dist' / name).read_text().splitlines() if not line.startswith('import ')).replace('export ', '')
core = '\n'.join(inline_source(name) for name in modules)
app = inline_source('app.js')
photo = 'data:image/jpeg;base64,' + base64.b64encode((root / 'dist/demo.jpg').read_bytes()).decode()
app = app.replace("'./demo.jpg'", repr(photo))
app = app.replace("await Promise.all([loadImage(" + repr(photo) + ",'湖边的木屋 · 示例照片',true),checkAI()]);",
                  "await loadImage(" + repr(photo) + ",'湖边的木屋 · 示例照片',true);$('aiStatus').textContent='本地单文件模式。启用 AI 请使用“启用AI.command”。';")
assert '),checkAI()]);' not in app
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
html = html.replace('<script type="module" src="app.js"></script>', '<script type="module">\n' + core + '\n' + app + '\n</script>')
(root / '留白-本地体验.html').write_text(html)
print('已生成 留白-本地体验.html')
