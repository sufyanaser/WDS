# دليل التطوير والبناء المحلي (Development Guide)

يشرح هذا الدليل كيفية إعداد بيئة التطوير المحلية لمشروع **WDS (Wajibati Development Studio)** وبناء التطبيق وإجراء الاختبارات.

---

## 🛠️ المتطلبات البرمجية الأساسية

1. **Node.js:** إصدار 20 LTS أو 22+.
2. **Rust & Cargo:** أحدث إصدار مستقر (`rustup update stable`).
3. **C++ Build Tools:** متوفرة مع Visual Studio Community عبر حزمة "Desktop development with C++".
4. **Android SDK & Platform-Tools:** (اختياري للتحكم المحلي في محاكي الأندرويد).
5. **Git:** الإصدار 2.40+.

---

## 📦 تثبيت الاعتماديات

```powershell
# تثبيت حزم Node.js
npm install

# فحص كود Rust واعتماديات Cargo
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## 🚀 التشغيل في وضع التطوير (Dev Mode)

يستخدم المشروع مشغلاً ذكياً [`scripts/wds-dev-runner.mjs`](../scripts/wds-dev-runner.mjs) لمنع تعارض المنافذ:

```powershell
npm run tauri dev
```

يقوم هذا الأمر بتشغيل:
- خادم Vite على `http://localhost:1420`.
- موجه الجلسات المعزولة لمنافذ `5174` (أندرويد) و`5175` (آيفون).
- تطبيق Tauri المكتبي مع تفعيل مراقبة التغييرات (Hot-Reload).

---

## 🧪 إجراء الفحوصات واختبارات الجودة

قبل إنشاء أي Commit، يجب اجتياز جميع الفحوصات:

```powershell
# فحص الأنواع الصارم لـ TypeScript
npm run lint

# بناء حزمة الإنتاج للواجهة الأمامية
npm run build

# تشغيل اختبارات الوحدة في Rust (31 اختباراً)
cargo test --lib --manifest-path src-tauri/Cargo.toml

# اختبار عزل الجلسات والمنافذ
node tests/test-session-isolation.mjs
```

---

## 💻 ربط محاكي iOS عبر Mac

1. تأكد من تشغيل MacBook على الشبكة المحلية (`192.168.68.100`).
2. تأكد من تفعيل خدمة **Remote Login** في macOS: `System Settings -> General -> Sharing -> Remote Login`.
3. افتح لوحة **WDS Connect** من التطبيق وأدخل بيانات الاعتماد (يتم حفظها بأمان في Windows Credential Manager).
4. يمكنك إقلاع المحاكي وبث شاشته بنقرة واحدة عبر الواجهة.
