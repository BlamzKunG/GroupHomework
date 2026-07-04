# HomeworkSpace

แอปพลิเคชันสำหรับบันทึกและติดตามการบ้านกลุ่มร่วมกับเพื่อน พร้อมระบบแชทพูดคุยกันภายในห้องเรียนและแชทวิเคราะห์งานรายชิ้น

---

## ภาษาไทย (Thai Version)

### รายละเอียดทั่วไป
HomeworkSpace คือเว็บบอร์ดบันทึกการบ้านกลุ่มที่ออกแบบมาเพื่อให้สมาชิกในห้องเรียนหรือกลุ่มเพื่อนสามารถจัดการกำหนดส่งงาน ติดตามความคืบหน้า และแชร์ไฟล์หรือลิงก์ส่งงานร่วมกันได้แบบเรียลไทม์ผ่านเว็บเบราว์เซอร์ ทั้งในระบบเดสก์ท็อปและโทรศัพท์มือถือ

### คุณสมบัติหลัก
1. ระบบจัดการกลุ่มเรียน: สามารถแยกห้องทำงานกลุ่มหรือห้องเรียนออกจากกันได้อย่างเป็นสัดส่วน
2. บอร์ดการบ้านแบบคัมบัง: ติดตามสถานะของงานผ่านคอลัมน์ ต้องทำ กำลังทำ และเสร็จสิ้น
3. แชทห้องเรียนรวม: ระบบสนทนากลางประจำกลุ่มเรียนเพื่อแชร์ลิงก์ ปรึกษา และพูดคุยทั่วไป
4. แชทเฉพาะการบ้านชิ้นย่อย: ระบบแชทแยกเฉพาะงานแต่ละชิ้นสำหรับสมาชิกที่ได้รับมอบหมาย เพื่อแบ่งงาน แชร์ไฟล์เฉลย หรือปรึกษาข้อมูล
5. ระบบตรวจสอบสถานะและสถิติ: แสดงสรุปจำนวนงานคงค้าง อัตราความสำเร็จ และตารางจัดอันดับสมาชิกในกลุ่มที่ทำงานสำเร็จมากที่สุด
6. ระบบการแจ้งเตือนงานเร่งด่วน: แจ้งเตือนล่วงหน้าเมื่อใกล้ถึงกำหนดส่งงานภายใน 48 ชั่วโมง
7. การรองรับหน้าจอมือถืออย่างสมบูรณ์: ปรับเปลี่ยนการแสดงผลให้กะทัดรัด เหมาะกับการใช้นิ้วสัมผัสและปุ่มพิมพ์บนหน้าจอโทรศัพท์

### ความต้องการของระบบ
* Node.js (เวอร์ชัน 16.0 ขึ้นไป)
* npm (มาพร้อมกับ Node.js)

### การติดตั้งและการใช้งานเบื้องต้น
1. โคลนคลังโค้ดนี้ไปยังเครื่องของคุณ
2. เปิดโปรแกรม Terminal หรือ Command Prompt แล้วเข้าไปที่ไดเรกทอรีของโปรเจกต์
3. ติดตั้ง Dependencies ด้วยคำสั่ง:
   ```bash
   npm install
   ```
4. เริ่มรันเซิร์ฟเวอร์ด้วยคำสั่ง:
   ```bash
   npm run dev
   ```
5. เปิดเว็บเบราว์เซอร์แล้วเข้าไปที่ URL:
   ```
   http://localhost:3000
   ```

### คู่มือการใช้งานอย่างละเอียด

#### 1. การลงทะเบียนและการเข้าสู่ระบบ
* เมื่อเข้าสู่หน้าเว็บครั้งแรก คุณจะพบกับหน้าลงทะเบียนหรือเข้าสู่ระบบ
* คลิกแท็บ สมัครสมาชิก เพื่อลงทะเบียนด้วย ชื่อผู้ใช้งาน (เป็นภาษาอังกฤษ) ชื่อเล่นหรือชื่อสำหรับแสดงตัว และรหัสผ่าน พร้อมทั้งเลือกสีโปรไฟล์ประจำตัวของคุณ
* ระบบจะทำการล็อกอินให้อัตโนมัติเมื่อสมัครสมาชิกเสร็จสิ้น หรือคุณสามารถใช้ชื่อผู้ใช้งานและรหัสผ่านเพื่อเข้าสู่ระบบในภายหลัง

#### 2. การสร้างและจัดการกลุ่มเรียน
* เมื่อเข้าสู่หน้าแดชบอร์ดหลัก หากคุณยังไม่มีกลุ่มเรียน ให้คลิกปุ่มที่มีเครื่องหมายบวกข้างช่องเลือกกลุ่มเพื่อสร้างกลุ่มใหม่
* เมื่อสร้างเสร็จสิ้น คุณสามารถเลือกสลับกลุ่มเรียนไปมาได้ที่ช่องตัวเลือกกลุ่มเรียนด้านบนซ้ายของหน้าจอ

#### 3. การบันทึกการบ้านและการมอบหมายงาน
* คลิกปุ่ม เพิ่มการบ้านใหม่ ที่แถบเมนู
* กรอกหัวข้อการบ้าน เลือกวิชา (คุณสามารถคลิกปุ่มสร้างวิชาใหม่ได้หากยังไม่มีรายวิชานั้นในระบบ) และเลือกระดับความสำคัญของงาน (สูงมาก ปานกลาง ต่ำ)
* กำหนดวันและเวลาส่งงาน
* ทำเครื่องหมายเลือกชื่อสมาชิกในกลุ่มที่จะมารับผิดชอบงานชิ้นนี้ จากนั้นกดบันทึก
* งานจะถูกจัดเข้าไปยังคอลัมน์ ต้องทำ ในรูปแบบของการ์ดกระดาษโน้ตทันที

#### 4. การจัดการและย้ายสถานะการบ้าน
* สมาชิกสามารถลากและวางการ์ดการบ้านเพื่อย้ายสถานะระหว่างช่อง ต้องทำ กำลังทำ และเสร็จสิ้น ได้โดยตรงบนหน้าจอ PC
* สำหรับหน้าจอมือถือ คุณสามารถคลิกที่ตัวการ์ดเพื่อเปิดดูรายละเอียด และเลือกเปลี่ยนสถานะการทำงานจากเมนูตัวเลือกด้านล่าง

#### 5. การสนทนาและส่งลิงก์คุยงาน (ระบบแชท)
* แชทห้องเรียนรวม: คลิกปุ่ม แชทห้องเรียน สีม่วงข้างชื่อกลุ่ม หรือปุ่มไอคอนแชทในแถบนำทางด้านบน เพื่อเปิดกระดานสนทนากลางคุยงานและแชร์ลิงก์ข้อมูลของกลุ่มนั้นๆ
* แชทเฉพาะงานย่อย: 
  * สำหรับเครื่อง PC: คลิกที่ตัวการ์ดการบ้านใดก็ได้ หน้าจอรายละเอียดจะแสดงขึ้นพร้อมกับหน้าต่างแชททางด้านขวา
  * สำหรับโทรศัพท์มือถือ: คลิกที่ไอคอนรูปกล่องข้อความบนการ์ดการบ้านเพื่อเข้าสู่แชทของงานนั้นโดยตรง หรือคลิกที่ตัวการ์ดแล้วสลับไปที่แท็บ แชทคุยงาน ด้านบนของหน้าต่างรายละเอียด
* การแนบลิงก์ในแชท: สมาชิกสามารถคลิกปุ่ม แนบลิงก์ เพื่อใส่ URL และตั้งชื่อป้ายกำกับลิงก์ เช่น ลิงก์โฟลเดอร์ส่งงาน Google Drive หรือชีทสรุปสูตร จากนั้นคลิกปุ่มส่ง ลิงก์จะแสดงผลเป็นปุ่มกดที่สามารถคลิกเพื่อเปิดไปยังหน้าเป้าหมายได้ทันที

---

## English Version

### Description
HomeworkSpace is a collaborative homework tracking web application designed to help classmates or study groups manage deadlines, monitor progress, and share learning resources or submission links in real-time. The application is highly optimized for both desktop and mobile layouts.

### Key Features
1. Room and Group Management: Create and organize separate study groups or projects cleanly.
2. Kanban Board Workflow: Manage task status easily using To Do, In Progress, and Done columns.
3. Classroom Group Chat: A centralized discussion board for members to talk and share links within each classroom.
4. Task-Specific Chat: Individual chat threads dedicated to each homework item, allowing assigned members to coordinate, ask questions, or share answer keys.
5. Stats and Leaderboard: Shows counts of pending tasks, success rates, and a leaderboard showing active members based on completed tasks.
6. Deadline Notifications: Displays alerts when tasks are due within 48 hours.
7. Mobile Responsive Optimization: Offers a compact and user-friendly interface optimized for touchscreen interaction and mobile keyboards.

### System Requirements
* Node.js (version 16.0 or higher)
* npm (bundled with Node.js)

### Installation and Setup
1. Clone this repository to your local machine.
2. Open terminal/command prompt and navigate to the project directory.
3. Install dependencies by running:
   ```bash
   npm install
   ```
4. Start the development server by running:
   ```bash
   npm run dev
   ```
5. Open your web browser and go to:
   ```
   http://localhost:3000
   ```

### Detailed Usage Guide

#### 1. Registration and Login
* On first launch, you will see the Authentication view.
* Click the Register tab to create an account by filling in your username (English only), display name, password, and selecting your personal avatar color.
* You will be automatically logged in after registration. Alternatively, log in using your credentials on subsequent visits.

#### 2. Group Management
* If you do not have any groups on the main dashboard, click the plus icon button next to the group selector to create a new classroom.
* Switch between different classrooms/groups via the dropdown selection at the top left of the navbar.

#### 3. Creating and Assigning Homework
* Click the New Homework button in the header toolbar.
* Provide a title, choose a subject (you can also create new subjects on the fly), and set a priority level (High, Medium, Low).
* Set the due date and time.
* Select the group members to assign the task to, then save.
* The homework card will be placed in the To Do column.

#### 4. Managing Tasks
* Move cards between To Do, In Progress, and Done columns by dragging and dropping them on desktop.
* On mobile devices, tap the card to open its details drawer and select the new status from the dropdown menu.

#### 5. Using Chats and Attaching Links
* Classroom General Chat: Click the Classroom Chat button next to the group title or the chat icon in the navigation bar to start general classroom discussions.
* Homework-Specific Chat:
  * On Desktop: Click any card on the board. The detail view will open showing the chat column on the right side.
  * On Mobile: Click the chat badge icon directly on the card to open its chat thread, or tap the card and switch to the Task Chat tab at the top of the modal.
* Sharing Links: Click the Attach Link button inside either chat form. Fill in the URL and the label name (e.g. Google Drive folder, Notion sheet), then submit. It will render a clickable link button in the conversation thread.

---

## License

This project is licensed under the MIT License. See the [LICENSE](file:///root/Web_hw/LICENSE) file for details.