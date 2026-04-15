# 🛠️ คู่มือแก้ไขปัญหาเบื้องต้น — WFH Daily Report

> เอกสารนี้รวบรวมปัญหาที่พบบ่อยและวิธีแก้ไขสำหรับผู้ใช้งานทุกระดับ

---

## สารบัญ

1. [ปัญหาการเข้าสู่ระบบ](#1-ปัญหาการเข้าสู่ระบบ)
   - [ระบบวนลูปกลับหน้า Login ซ้ำๆ](#11-ระบบวนลูปกลับหน้า-login-ซ้ำๆ)
   - [กรอกรหัสผ่านถูกแต่เข้าไม่ได้](#12-กรอกรหัสผ่านถูกแต่เข้าไม่ได้)
   - [ลืมรหัสผ่าน](#13-ลืมรหัสผ่าน)
2. [ปัญหาการแสดงข้อมูล](#2-ปัญหาการแสดงข้อมูล)
   - [ข้อมูลรายงานไม่แสดง / หน้าจอเปล่า](#21-ข้อมูลรายงานไม่แสดง--หน้าจอเปล่า)
   - [ไม่เห็นรายงานของลูกน้อง](#22-ไม่เห็นรายงานของลูกน้อง)
3. [ปัญหาการดาวน์โหลด Excel](#3-ปัญหาการดาวน์โหลด-excel)
4. [ปัญหาทั่วไปอื่นๆ](#4-ปัญหาทั่วไปอื่นๆ)
5. [ติดต่อผู้ดูแลระบบ](#5-ติดต่อผู้ดูแลระบบ)

---

## 1. ปัญหาการเข้าสู่ระบบ

### 1.1 ระบบวนลูปกลับหน้า Login ซ้ำๆ

**อาการ:** หลัง Login แล้ว ระบบพาไปหน้า Dashboard แต่ทันใดนั้นก็วนกลับมาหน้า Login อีกครั้ง เกิดซ้ำๆ ไม่หยุด

**สาเหตุ:** ระบบใช้ **LocalStorage** ของ Browser ในการเก็บ Session Token หากเบราว์เซอร์บล็อกการเขียน LocalStorage หรือมี Cache เสีย ระบบจะหา Token ไม่เจอและ Redirect กลับหน้า Login ตลอดเวลา

---

#### วิธีที่ 1 — ล้าง Cache และ Cookie ของ Browser

| Browser | ปุ่มลัด |
|---------|---------|
| ![Chrome](https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Google_Chrome_icon_%28February_2022%29.svg/24px-Google_Chrome_icon_%28February_2022%29.svg.png) Google Chrome | `Ctrl + Shift + Delete` |
| ![Firefox](https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Firefox_logo%2C_2019.svg/24px-Firefox_logo%2C_2019.svg.png) Mozilla Firefox | `Ctrl + Shift + Delete` |
| ![Edge](https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Microsoft_Edge_logo_%282019%29.svg/24px-Microsoft_Edge_logo_%282019%29.svg.png) Microsoft Edge | `Ctrl + Shift + Delete` |

**ขั้นตอนสำหรับ Google Chrome:**

1. กด `Ctrl + Shift + Delete` เพื่อเปิดหน้าต่างล้าง Cache

   ![Chrome Clear Cache Dialog](https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Google_Chrome_icon_%28February_2022%29.svg/64px-Google_Chrome_icon_%28February_2022%29.svg.png)

2. เลือก **ช่วงเวลา** เป็น `ตลอดเวลา` (All time)
3. ติ๊กถูก ✅ ที่รายการต่อไปนี้:
   - **Cookies and other site data**
   - **Cached images and files**
4. กดปุ่ม **"Clear data"**
5. รีโหลดหน้าและลอง Login ใหม่อีกครั้ง

---

#### วิธีที่ 2 — ตรวจสอบว่า Browser อนุญาต LocalStorage

บางครั้ง Browser ตั้งค่าบล็อก Storage ของเว็บไซต์ไว้

**สำหรับ Chrome:**
1. คลิกไอคอน 🔒 ที่ Address Bar ซ้ายมือ
2. เลือก **"Site settings"**

   ![Site Settings Icon](https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Google_Chrome_for_Android_Icon_2016.svg/64px-Google_Chrome_for_Android_Icon_2016.svg.png)

3. เลื่อนหา **"Storage"** หรือ **"Cookies and site data"**
4. ตรวจสอบว่าไม่ได้ตั้งเป็น **"Block"**
5. เปลี่ยนเป็น **"Allow"** แล้ว Refresh หน้า

---

#### วิธีที่ 3 — อย่าใช้ Private / Incognito Mode

![Incognito Icon](https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Google_Chrome_icon_%28February_2022%29.svg/48px-Google_Chrome_icon_%28February_2022%29.svg.png)

การใช้ **Private Mode** (หน้าต่างส่วนตัว) อาจทำให้ LocalStorage ถูกจำกัดสิทธิ์หรือถูกล้างเมื่อปิดหน้าต่าง แนะนำให้ใช้ Browser แบบปกติ (Normal Window)

> **ตรวจสอบ:** หากหน้าต่าง Browser มีไอคอนหมวก 🕵️ หรือหน้าต่างสีเข้มพร้อมข้อความ "You've gone incognito" แสดงว่าอยู่ใน Incognito Mode — ให้เปิดหน้าต่างใหม่แบบปกติแทน

---

### 1.2 กรอกรหัสผ่านถูกแต่เข้าไม่ได้

**อาการ:** กรอกอีเมลและรหัสผ่านแล้ว แต่ระบบแจ้ง Error หรือไม่ตอบสนอง

**ขั้นตอนการตรวจสอบ:**

1. **ตรวจสอบ Caps Lock**

   ![Keyboard](https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat_03.jpg/1px-Cat_03.jpg)

   ตรวจสอบว่าปุ่ม `Caps Lock` ไม่ได้เปิดอยู่ เพราะรหัสผ่านในระบบนี้เป็น Case-sensitive

2. **ตรวจสอบ Username Format**

   ระบบรองรับการกรอก username แบบย่อ:
   - ✅ กรอก `zepultula` → ระบบจะเติม `@rmutl.ac.th` ให้อัตโนมัติ
   - ✅ กรอก `zepultula@rmutl.ac.th` → ใช้ได้เช่นกัน
   - ❌ ห้ามมีช่องว่างก่อนหรือหลัง

3. **ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต**

   ![Network Icon](https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Ethernet_Connection.jpg/120px-Ethernet_Connection.jpg)

   เปิดเว็บไซต์อื่น เช่น google.com เพื่อยืนยันว่าอินเทอร์เน็ตทำงานปกติ

4. **ล้าง Auto-fill ของ Browser**

   Browser อาจกรอกรหัสผ่านเก่าให้อัตโนมัติ ลองคลิกช่อง Password แล้วลบออกทั้งหมดก่อนกรอกใหม่

---

### 1.3 ลืมรหัสผ่าน

**กรณีที่ 1 — ยังเข้าสู่ระบบได้:**

1. คลิกชื่อของท่านที่ **มุมขวาบน** ของหน้าจอ
2. เลือก **"เปลี่ยนรหัสผ่าน"**
3. กรอกรหัสผ่านเก่าและรหัสผ่านใหม่
4. กดยืนยัน

**กรณีที่ 2 — เข้าสู่ระบบไม่ได้:**

ติดต่อ **Super Admin** ของระบบเพื่อให้รีเซ็ตรหัสผ่านให้ → [ดูส่วนที่ 5](#5-ติดต่อผู้ดูแลระบบ)

---

## 2. ปัญหาการแสดงข้อมูล

### 2.1 ข้อมูลรายงานไม่แสดง / หน้าจอเปล่า

**อาการ:** เข้าระบบสำเร็จแล้วแต่ไม่มีข้อมูลแสดง หรือ Loading วนไม่หยุด

**ขั้นตอนการตรวจสอบ:**

#### ขั้นที่ 1 — ตรวจสอบอินเทอร์เน็ต

![WiFi Signal](https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Wifi_icon.png/120px-Wifi_icon.png)

ระบบดึงข้อมูลแบบ Real-time จาก Server ทุกครั้ง หากอินเทอร์เน็ตขาดหาย ข้อมูลจะไม่แสดง

- ทดสอบโดยเปิดเว็บอื่น เช่น [google.com](https://www.google.com)
- หากอินเทอร์เน็ตมีปัญหา ให้ลองเชื่อมต่อ WiFi ใหม่หรือติดต่อ IT Support

#### ขั้นที่ 2 — เลือกวันที่ถูกต้อง

ระบบแสดงรายงานตามวันที่ที่เลือก ตรวจสอบว่าเลือกวันที่ถูกต้องแล้ว

#### ขั้นที่ 3 — กด Hard Refresh

![Refresh Icon](https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Refresh_icon.png/64px-Refresh_icon.png)

กด `Ctrl + Shift + R` (หรือ `Cmd + Shift + R` บน Mac) เพื่อ Force Reload หน้าเว็บโดยไม่ใช้ Cache

#### ขั้นที่ 4 — ตรวจสอบ Console Error (สำหรับผู้ใช้ขั้นสูง)

1. กด `F12` เพื่อเปิด Developer Tools
2. คลิกแท็บ **"Console"**
3. มองหาข้อความสีแดง (Error) และแจ้งข้อความนั้นให้ผู้ดูแลระบบ

---

### 2.2 ไม่เห็นรายงานของลูกน้อง

**อาการ:** หัวหน้างานเข้าระบบแล้วแต่ไม่เห็นรายงานของลูกน้องในทีม

**สาเหตุและวิธีแก้ไข:**

| สาเหตุที่เป็นไปได้ | วิธีตรวจสอบ | ผู้รับผิดชอบแก้ไข |
|-------------------|-------------|-----------------|
| ยังไม่ได้กำหนดสายบังคับบัญชา | Super Admin ตรวจสอบเมนู 🔗 | Super Admin |
| กำหนดสายบังคับบัญชาผิดคน | ตรวจสอบรายชื่อใน Evaluation | Super Admin |
| ลูกน้องยังไม่ได้ส่งรายงาน | ดูในแท็บ "ยังไม่ส่ง" | — |
| Level ของ Account ไม่ถูกต้อง | Super Admin ตรวจสอบ Level ใน User Management | Super Admin |

**ขั้นตอนสำหรับ Super Admin — ตรวจสอบสายบังคับบัญชา:**

1. Login ด้วย Account Super Admin (Level 9)
2. คลิกเมนู **"🔗 สายบังคับบัญชา"** ในแถบด้านบน
3. ค้นหาชื่อพนักงานที่เป็นลูกน้อง (target)
4. ตรวจสอบว่าชื่อหัวหน้าอยู่ในรายการ **"ผู้ประเมิน"** หรือไม่
5. หากไม่มี ให้กดเพิ่มผู้ประเมินและบันทึก

---

## 3. ปัญหาการดาวน์โหลด Excel

**อาการ:** กดปุ่มดาวน์โหลด Excel แต่ไม่มีไฟล์ถูก Download หรือ Browser บล็อก

![Excel Icon](https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Microsoft_Office_Excel_%282019%E2%80%93present%29.svg/64px-Microsoft_Office_Excel_%282019%E2%80%93present%29.svg.png)

#### สาเหตุที่พบบ่อย

**Browser บล็อก Popup / Download:**

1. ดูที่ **Address Bar** ว่ามีไอคอน 🚫 หรือ ⬇️ พร้อมข้อความว่า "Pop-up blocked" หรือไม่
2. คลิกไอคอนนั้นและเลือก **"Allow downloads from this site"**
3. กดปุ่ม Download อีกครั้ง

**ไฟล์อยู่ที่ไหน:**

- ค้นหาในโฟลเดอร์ **Downloads** (`C:\Users\<ชื่อ>\Downloads`) บน Windows
- ชื่อไฟล์จะเป็น `รายงาน_YYYY-MM-DD.xlsx` หรือ `สถิติ_YYYY-MM.xlsx`

**ปุ่มค้างอยู่ที่ "กำลังโหลด..." นานเกิน 30 วินาที:**

- กด `F5` เพื่อ Refresh หน้า
- ตรวจสอบอินเทอร์เน็ต
- ลองอีกครั้ง หากยังค้างอยู่ให้แจ้ง Admin

---

## 4. ปัญหาทั่วไปอื่นๆ

### ปุ่ม Auto-save ไม่ทำงาน / รายงานหาย

**อาการ:** กรอกข้อมูลแล้วแต่หลังจาก Refresh ข้อมูลหาย

**ตรวจสอบ:**
- ดูที่มุมขวาบนของฟอร์มว่ามีข้อความ **"บันทึกแล้ว ✓"** หรือไม่
- หากมีข้อความ **"ไม่สามารถบันทึก"** แสดงว่ามีปัญหาการเชื่อมต่อ — ตรวจสอบอินเทอร์เน็ต
- ระบบ Auto-save จะทำงานทุกครั้งที่มีการเปลี่ยนแปลง หากไม่เห็นสัญญาณยืนยัน ให้กด **"บันทึก"** ด้วยตนเอง

---

### หน้าจอแสดงผลผิดปกติ / ตัวหนังสือทับกัน

**สาเหตุ:** อาจเกิดจาก CSS Cache เก่าค้างอยู่

**วิธีแก้:**

| ขั้นตอน | คำสั่ง |
|---------|--------|
| Hard Refresh | `Ctrl + Shift + R` |
| ล้าง Cache ทั้งหมด | `Ctrl + Shift + Delete` → เลือก "Cached images and files" |
| ทดสอบบน Browser อื่น | ลองใช้ Edge หรือ Firefox แทน Chrome |

---

### ระบบแสดงข้อผิดพลาด "403 Forbidden" หรือ "401 Unauthorized"

**อาการ:** Browser แสดง Error 403 หรือ 401 เมื่อพยายามเข้าหน้าใดหน้าหนึ่ง

**วิธีแก้:**
1. **Logout** ออกจากระบบ
2. ล้าง Cache และ Cookie (ดูวิธีที่ 1 ด้านบน)
3. **Login ใหม่** อีกครั้ง
4. หากยังเกิดปัญหา แจ้ง Super Admin เพื่อตรวจสอบสิทธิ์ (Level) ของ Account

---

### Browser ที่แนะนำ

![Browsers](https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Google_Chrome_icon_%28February_2022%29.svg/32px-Google_Chrome_icon_%28February_2022%29.svg.png) ![Firefox](https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Firefox_logo%2C_2019.svg/32px-Firefox_logo%2C_2019.svg.png) ![Edge](https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Microsoft_Edge_logo_%282019%29.svg/32px-Microsoft_Edge_logo_%282019%29.svg.png)

| Browser | เวอร์ชันขั้นต่ำที่แนะนำ | หมายเหตุ |
|---------|----------------------|---------|
| Google Chrome | 100+ | แนะนำ |
| Microsoft Edge | 100+ | แนะนำ |
| Mozilla Firefox | 100+ | รองรับ |
| Safari | 15+ | รองรับ (Mac/iOS) |
| Internet Explorer | ❌ ไม่รองรับ | โปรดเปลี่ยน Browser |

---

## 5. ติดต่อผู้ดูแลระบบ

หากลองวิธีข้างต้นทั้งหมดแล้วยังไม่สามารถแก้ไขได้ โปรดแจ้งปัญหาให้ผู้ดูแลระบบ (Super Admin) พร้อมข้อมูลต่อไปนี้:

```
📋 ข้อมูลสำหรับแจ้งปัญหา:
- ชื่อ-นามสกุล และ Username
- วันที่และเวลาที่เกิดปัญหา
- อาการที่พบ (อธิบายโดยละเอียด)
- Browser และเวอร์ชันที่ใช้
- ข้อความ Error ที่ปรากฏ (ถ่ายภาพหน้าจอหากทำได้)
- ขั้นตอนที่ทำก่อนเกิดปัญหา
```

---

> [!NOTE]
> เอกสารนี้อ้างอิงจากระบบ **WFH Daily Report v2.5.1** หากระบบมีการอัปเดตในภายหลัง บางขั้นตอนอาจเปลี่ยนแปลงไป

> [!TIP]
> วิธีที่เร็วที่สุดในการแก้ปัญหาส่วนใหญ่คือ กด `Ctrl + Shift + Delete` → ล้าง Cache → Login ใหม่
