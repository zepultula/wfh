import re

with open('static/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

style_match = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
if style_match:
    with open('static/css/style.css', 'w', encoding='utf-8') as f:
        f.write(style_match.group(1).strip())
    html = html.replace(style_match.group(0), '<link rel="stylesheet" href="/static/css/style.css">')

script_match = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
if script_match:
    with open('static/js/app.js', 'w', encoding='utf-8') as f:
        f.write(script_match.group(1).strip())
    html = html.replace(script_match.group(0), '<script src="/static/js/app.js"></script>')

with open('static/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
