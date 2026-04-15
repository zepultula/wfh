import re

#? เปิดไฟล์ index.html หลักเพื่ออ่านเนื้อหาทั้งหมดมาเตรียมทำการแยกส่วน
with open('static/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

#? ค้นหาส่วนของ CSS ที่อยู่ในแท็ก <style> โดยใช้ Regular Expression
#? re.DOTALL ช่วยให้ค้นหาข้ามบรรทัดได้ (Match ตัวขึ้นบรรทัดใหม่ด้วย)
style_match = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
if style_match:
    #? หากพบแท็ก <style> ให้แยกเนื้อหาภายในไปเขียนลงในไฟล์ .css แยกต่างหาก
    #! คำเตือน: ไฟล์ static/css/style.css เดิมจะถูกเขียนทับทันที
    with open('static/css/style.css', 'w', encoding='utf-8') as f:
        f.write(style_match.group(1).strip())
    #? แทนที่แท็ก <style> เดิมด้วยแท็ก <link> เพื่อดึงไฟล์ CSS จากภายนอกมาใช้แทน
    html = html.replace(style_match.group(0), '<link rel="stylesheet" href="/static/css/style.css">')

#? ค้นหาส่วนของ JavaScript ที่อยู่ในแท็ก <script>
script_match = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
if script_match:
    #? แยกเนื้อหา JS ไปเขียนลงในไฟล์ .js แยกต่างหากเพื่อความสะอาดของโค้ด
    #! คำเตือน: ไฟล์ static/js/app.js เดิมจะถูกเขียนทับ
    with open('static/js/app.js', 'w', encoding='utf-8') as f:
        f.write(script_match.group(1).strip())
    #? แทนที่แท็ก <script> เดิมด้วยการเรียกใช้ไฟล์จากภายนอก (Script Src)
    html = html.replace(script_match.group(0), '<script src="/static/js/app.js"></script>')

#? บันทึกไฟล์ index.html ที่ได้รับการแก้ไข (ตัด Style/Script ออกแล้ว) กลับลงไปที่เดิม
#! คำเตือน: การรันสคริปต์นี้ซ้ำอาจส่งผลต่อความถูกต้องหากมีโครงสร้างที่ซับซ้อนขึ้น
with open('static/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

#todo พัฒนาให้รองรับการค้นหาและแยกไฟล์แบบหลายๆ แท็ก (กรณีมีสคริปต์หลายชุดในไฟล์เดียว)
#todo เพิ่มระบบสำรองไฟล์ (Backup) ก่อนทำการเขียนทับทุกครั้งเพื่อความปลอดภัยของข้อมูลต้นฉบับ
