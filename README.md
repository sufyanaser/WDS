# استوديو تطوير واجباتي (Wajibati Development Studio - WDS)

[![CI](https://github.com/sufyanaser/WDS/actions/workflows/ci.yml/badge.svg)](https://github.com/sufyanaser/WDS/actions/workflows/ci.yml)
[![Release](https://github.com/sufyanaser/WDS/actions/workflows/release.yml/badge.svg)](https://github.com/sufyanaser/WDS/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Wajibati Development Studio (WDS)** هو بيئة تطوير موحدة ومتطورة مبنية باستخدام **Tauri 2** و**React 19** و**Rust**، مخصصة لتطوير ومعاينة تطبيق «واجباتي» واختباره بصورة متزامنة ومستقلة على ثلاث منصات رئيسية داخل نافذة سطح مكتب واحدة:

1. **Desktop (Windows):** تشغيل التطبيق في بيئة سطح مكتب كاملة.
2. **Android (Mobile):** تحكم تفاعلي مباشر بمحاكي أندرويد الفيزيائي الحقيقي (AVD) بدقة شاشة 1080×2400.
3. **iPhone (iOS):** بث وتحكم تفاعلي بمحاكي iOS الحقيقي العامل على جهاز MacBook عبر شبكة محلية مشفرة.

---

## 🚀 الميزات الرئيسية

- **واجهة عمل مسطحة (Flat Desktop-First Workspace):** توزيع مساحات ذكي بنسبة 60% لسطح المكتب و20% لأندرويد و20% لآيفون مع فواصل قابلة للسحب تفاعلياً (`SplitDivider`) وحفظ الإعدادات في الذاكرة المحلية.
- **تفاعل لمسي دقيق للمحاكي:** معايرة دقيقة لإحداثيات النقر والسحب تتطابق مع دقة الشاشة الفعلية للمحاكي دون حقول نصية اصطناعية.
- **جسر WDS Connect للماك:** اتصال SSH فائق السرعة عبر مكتبة Russh ببروتوكولات Ed25519 ومراقبة النبض (Heartbeat) وتخزين بيانات الاعتماد في Windows Credential Manager.
- **عزل تام للجلسات (RFC 6454 SOP):** كل منصة تعمل على منفذ محلي مستقل (`5173`, `5174`, `5175`) لمنع تداخل ملفات تعريف الارتباط أو الذاكرة المؤقتة.
- **نظام التحديث التلقائي الآمن (Tauri Auto-Updater):** فحص الإصدارات الجديدة تلقائياً، والتحقق من التوقيع الرقمي بمفتاح Minisign المشفر وتثبيت التحديثات دون فقدان بيانات المستخدم.

---

## 💻 متطلبات التشغيل على Windows

- **نظام التشغيل:** Windows 10 أو Windows 11 (معمارية x64).
- **WebView2:** مدمج تلقائياً في Windows 11، أو Microsoft Edge WebView2 Runtime.
- **محاكي Android (اختياري للتحكم المحلي):** Android Studio مع جهاز افتراضي مُعد (مثل `Medium_Phone_API_37.0`) وADB.
- **جهاز MacBook (اختياري لمحاكي iOS):** متصل على نفس الشبكة المحلية مع تفعيل Remote Login (SSH) وXcode Simulator.

---

## 📥 التثبيت والتشغيل السريع

### التثبيت للمستخدم النهائي
1. حمّل أحدث مثبت بصيغة NSIS (`Wajibati Development Studio_x.x.x_x64-setup.exe`) من صفحة [GitHub Releases](https://github.com/sufyanaser/WDS/releases).
2. شغّل ملف التثبيت واتبع التعليمات البسيطة.
3. افتح التطبيق من قائمة ابدأ أو سطح المكتب.

### التشغيل للمطورين
للبناء والتشغيل من المصدر:
```bash
# تثبيت الاعتماديات
npm install

# تشغيل خادم التطوير مع Tauri
npm run tauri dev
```

---

## 📚 التوثيق المرفق

- [دليل التطوير والبناء المحلي (DEVELOPMENT.md)](docs/DEVELOPMENT.md)
- [دليل دورة الإصدارات والنشر (RELEASE-PROCESS.md)](docs/RELEASE-PROCESS.md)
- [دليل نظام التحديث التلقائي الآمن (AUTO-UPDATE.md)](docs/AUTO-UPDATE.md)

---

## 🔒 الأمان والتوقيع الرقمي

جميع الإصدارات وحزم التحديثات المنشورة في هذا المستودع موقعة رقمياً ومفحوصة ضد أي تسريب للمفاتيح أو بيانات الاعتماد الحساسة.
