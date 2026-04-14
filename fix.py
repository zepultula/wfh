with open('static/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('<span class="sp sp-done">✓ เสร็จแล้ว</span>', '<span class="sp sp-done selected" data-status="done">✓ เสร็จแล้ว</span>')
text = text.replace('<span class="sp sp-prog">⋯ กำลังดำเนินการ</span>', '<span class="sp sp-prog" data-status="prog">⋯ กำลังดำเนินการ</span>')
text = text.replace('<span class="sp sp-pend">◯ ยังไม่เริ่ม</span>', '<span class="sp sp-pend" data-status="pend">◯ ยังไม่เริ่ม</span>')

with open('static/index.html', 'w', encoding='utf-8') as f:
    f.write(text)
