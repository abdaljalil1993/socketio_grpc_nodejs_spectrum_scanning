# سيناريوهات حقيقية: ماذا يحدث لملفات IQ؟

## 📝 السيناريو 1: التدفق الطبيعي (Happy Path)

### ما الذي يحدث عند رفع ملف IQ؟

```
المستخدم
   │
   ▼
POST /records (رفع ملف IQ)
   │
   ├─ 1️⃣ إنشاء UUID: 5f43bf0f-2cc9-4bbe-8064-2a953e16c1d1
   │
   ├─ 2️⃣ توليد اسم الملف:
   │     recording-5f43bf0f-2cc9-4bbe-8064-2a953e16c1d1.sigmf-data
   │
   ├─ 3️⃣ إنشاء Metadata:
   │     ┌─────────────────────────────────────┐
   │     │ {                                   │
   │     │  "global": {                        │
   │     │    "core:datatype": "cf32_le",      │
   │     │    "core:sample_rate": 1000000,     │
   │     │    "core:sha512": "abc123...",      │
   │     │    "core:version": "1.2.6"          │
   │     │  }                                  │
   │     │ }                                   │
   │     └─────────────────────────────────────┘
   │
   ├─ 4️⃣ حفظ في File System:
   │     storage/iq-files/
   │     ├── recording-5f43bf0f...sigmf-data   ✓ حفظ
   │     └── recording-5f43bf0f...sigmf-meta   ✓ حفظ
   │
   ├─ 5️⃣ حفظ في قاعدة البيانات:
   │     INSERT INTO signal_records
   │     VALUES (
   │       uuid: '5f43bf0f-2cc9-4bbe-8064-2a953e16c1d1',
   │       iq_file: 'recording-5f43bf0f...sigmf-data',
   │       sample_rate: 1000000,
   │       data_type: 'cf32_le',
   │       ...
   │     )  ✓
   │
   ▼
✅ استجابة ناجحة:
   {
     "record": { ... },
     "iqFileDownloadUrl": "/records/5f43bf0f.../iq-file",
     "sigmfDataDownloadUrl": "/records/5f43bf0f.../sigmf-data",
     "sigmfMetaDownloadUrl": "/records/5f43bf0f.../sigmf-meta",
     "sigmfArchiveDownloadUrl": "/records/5f43bf0f.../sigmf"
   }
```

### البيانات الناتجة:

**في الملفات:**
```
storage/iq-files/
├── recording-5f43bf0f-2cc9-4bbe-8064-2a953e16c1d1.sigmf-data
│   └── [8 MB] بيانات IQ الخام
└── recording-5f43bf0f-2cc9-4bbe-8064-2a953e16c1d1.sigmf-meta
    └── [2 KB] JSON metadata
```

**في قاعدة البيانات:**
```sql
SELECT * FROM signal_records WHERE uuid = '5f43bf0f-2cc9-4bbe-8064-2a953e16c1d1';

+------+-------+----------+---------+
| uuid | iq_file                            | sample_rate | ...
+------+-------+----------+---------+
| 5f43... | recording-5f43bf0f...sigmf-data | 1000000     | ...
+------+-------+----------+---------+
```

---

## 🚨 السيناريو 2: حذف ملف من التخزين (الكارثة!)

### السيناريو 1: حذف الملف يدويًا من الخادم

```bash
# المسؤول يحذف الملف بطريق الخطأ
$ rm storage/iq-files/recording-5f43bf0f-2cc9-4bbe-8064-2a953e16c1d1.sigmf-data

✅ الملف محذوف من File System
❌ السجل باقٍ في قاعدة البيانات!
```

### النتيجة:

```
محاولة تحميل الملف:
   │
   ├─ GET /records/5f43bf0f-2cc9-4bbe-8064-2a953e16c1d1/iq-file
   │
   ├─ 1️⃣ البحث في قاعدة البيانات: ✓ وجدت السجل
   │
   ├─ 2️⃣ محاولة قراءة الملف: ❌ ملف غير موجود
   │
   ▼
❌ HTTP 404 - Stored SigMF recording not found
```

### المشكلة:
- ❌ السجل يشير إلى ملف غير موجود
- ❌ المستخدم لا يعرف أن الملف كان موجوداً
- ❌ قد تبقى هذه السجلات مثل "الأشباح" في البيانات

---

## 🔄 السيناريو 3: انقطاع الاتصال أثناء الحفظ

### ما يحدث:

```
رفع ملف IQ
   │
   ▼
┌─────────────────────────────────────┐
│ الخطوة 1: حفظ في قاعدة البيانات ✓  │
│ (السجل أضيف)                       │
└─────────────────────┬───────────────┘
                      │
                      ▼
┌─────────────────────────────────────┐
│ الخطوة 2: حفظ ملف البيانات ✓        │
│ (الملف IQ مخزن)                    │
└─────────────────────┬───────────────┘
                      │
                      ▼ 🔌 انقطع الاتصال!
┌─────────────────────────────────────┐
│ الخطوة 3: حفظ البيانات الوصفية ❌   │
│ (فشل - الملف .sigmf-meta لم يُحفظ) │
└─────────────────────────────────────┘
```

### النتيجة:

**الحالة النهائية:**
```
قاعدة البيانات:     ✓ السجل موجود
File System:        ⚠️ ملف IQ موجود
                    ❌ ملف Metadata مفقود

الملفات:
storage/iq-files/
├── recording-5f43bf0f...sigmf-data  ✓ 8MB
└── recording-5f43bf0f...sigmf-meta  ❌ مفقود!
```

### ماذا يحدث عند محاولة تحميل الملف؟

```typescript
async exists(dataFileName: string): Promise<boolean> {
  try {
    // التحقق من كلا الملفين
    await Promise.all([
      fs.access(getFilePath(dataFileName)),                    // ✓ موجود
      fs.access(getFilePath(getSigmfMetaFileName(dataFileName))) // ❌ مفقود
    ]);
    return true;
  } catch {
    return false;  // ❌ ترجع false لأن الـ metadata مفقود
  }
}
```

**النتيجة:**
```
HTTP 404 - Stored SigMF recording not found

بينما الملف موجود بالفعل! 😤
```

---

## 📊 السيناريو 4: تضارب البيانات (Data Mismatch)

### المشكلة:

```
الحالة الأولية:
┌────────────────────────────────┐
│ قاعدة البيانات  │  File System  │
│───────────────────────────────│
│ UUID: 5f43bf0f │ 5f43bf0f.data │
│ UUID: c901caf3 │ c901caf3.data │
│ UUID: a1b2c3d4 │ ❌ (مفقود)     │
│ UUID: e5f6g7h8 │ ❌ (مفقود)     │
└────────────────────────────────┘

مقابلة: 4 سجلات ولكن فقط 2 ملف = 50% نقص في البيانات!
```

### كيفية اكتشاف هذا:

```typescript
async function validateStorageIntegrity() {
  const records = await service.findAll();  // 4 سجلات
  const missingFiles = [];
  
  for (const record of records) {
    if (!await fileStorage.exists(record.iqFile)) {
      missingFiles.push({
        uuid: record.uuid,
        expectedFile: record.iqFile
      });
    }
  }
  
  // missingFiles سيحتوي على:
  // [
  //   { uuid: 'a1b2c3d4', expectedFile: '...' },
  //   { uuid: 'e5f6g7h8', expectedFile: '...' }
  // ]
}
```

---

## 💾 السيناريو 5: وجود ملفات يتيمة (Orphaned Files)

### ما الذي يحدث:

```
عملية حفظ فشلت جزئياً:

الخطوة 1: حفظ قاعدة البيانات ✓
خطوة 2: حفظ الملفات ✓
خطوة 3: رفع استثناء ❌

النتيجة:
- الملفات محفوظة في File System
- لكن السجل لم يُحفظ أو تم حذفه بسبب الخطأ
```

### البيانات الناتجة:

```
قاعدة البيانات:    ❌ لا سجل
File System:       ✓ الملفات موجودة

storage/iq-files/
├── recording-xyz...sigmf-data  ← ملف يتيم!
└── recording-xyz...sigmf-meta  ← ملف يتيم!

هذه الملفات تستهلك مساحة ولا أحد يعرف عنها! 😭
```

### التأثير:

```
┌─────────────────────────────────────┐
│ الملفات اليتيمة تعني:               │
│ • هدر مساحة التخزين                │
│ • استحالة الوصول إلى البيانات       │
│ • بطء نظام البحث                   │
│ • عدم وضوح الإحصائيات             │
└─────────────────────────────────────┘
```

---

## 🔍 كيفية اكتشاف المشاكل

### 1. فحص سريع:

```bash
# عد السجلات
mysql> SELECT COUNT(*) FROM signal_records;
# النتيجة: 1000 سجل

# عد الملفات
$ ls storage/iq-files/*.sigmf-data | wc -l
# النتيجة: 950 ملف

# المشكلة: 50 سجل بدون ملفات! 🚨
```

### 2. البحث عن السجلات بدون ملفات:

```typescript
const records = await service.findAll();
const missing = [];

for (const record of records) {
  if (!await fileStorage.exists(record.iqFile)) {
    missing.push(record);
  }
}

console.log(`وجدنا ${missing.length} سجل بدون ملفات`);
```

### 3. حساب مساحة التخزين الضائعة:

```bash
# احسب حجم جميع الملفات
$ du -sh storage/iq-files/
# 500 GB

# لكن قد تكون الملفات اليتيمة 50 GB من هذا!
```

---

## 🛡️ الحماية والوقاية

### قبل أن يحدث أي مشكلة:

```typescript
// 1. تشغيل فحص سلامة دوري
setInterval(async () => {
  const issues = await checkStorageIntegrity();
  if (issues.length > 0) {
    logger.error(`⚠️ وجدنا ${issues.length} مشكلة في التخزين`);
    await notifyAdmin(issues);
  }
}, 24 * 60 * 60 * 1000); // كل 24 ساعة

// 2. التحقق من SHA512
setInterval(async () => {
  const checksums = await verifyChecksums();
  const invalid = checksums.filter(c => !c.isValid);
  if (invalid.length > 0) {
    logger.error(`⚠️ وجدنا ${invalid.length} ملف بـ checksum غير صحيح`);
  }
}, 7 * 24 * 60 * 60 * 1000); // كل أسبوع

// 3. مراقبة مساحة التخزين
setInterval(async () => {
  const stats = await getStorageStats();
  if (stats.totalSizeMB > 900 * 1024) { // 900 GB من 1 TB
    logger.warn(`⚠️ التخزين ممتلئ 90%: ${stats.totalSizeMB} MB`);
    await alertAdmin();
  }
}, 60 * 60 * 1000); // كل ساعة
```

---

## 📋 جدول الحالات

| الحالة | السجل في DB | الملف في FS | النتيجة | الحل |
|-------|----------|----------|--------|------|
| طبيعي | ✓ | ✓ | ✅ سليم | لا يوجد |
| ملف مفقود | ✓ | ❌ | ⚠️ خطأ | حذف السجل |
| ملف يتيم | ❌ | ✓ | ⚠️ هدر | حذف الملف |
| كليهما مفقود | ❌ | ❌ | ✅ متسق | لا يوجد |
| فساد Checksum | ✓ | ✓ | ❌ تالف | استعادة من نسخة احتياطية |

---

## 🎯 السؤال الأساسي: "هل البيانات تضيع؟"

### الإجابة:

**نعم، هناك احتمالية فقدان البيانات في الحالات التالية:**

1. ✅ **عند انقطاع الاتصال أثناء الحفظ**
   - الحل المقترح: تطبيق آليات Atomic Operations

2. ✅ **عند حذف ملف يدويًا دون حذف السجل**
   - الحل المقترح: تطبيق فحوصات دورية

3. ✅ **عند فشل نسخ الملفات**
   - الحل المقترح: إعادة محاولة آلية

4. ✅ **عند عطل الخادم**
   - الحل المقترح: نسخ احتياطية دوري

### الحالات الآمنة:

- ✅ البيانات محمية من التلف (SHA512)
- ✅ معالجة الأخطاء الجيدة تحافظ على التطابق
- ✅ سجلات واضحة في قاعدة البيانات

---

## ✨ الخلاصة

```
النظام الحالي:
┌─────────────────────────────────────┐
│ ✅ تصميم جيد ومعياري                │
│ ✅ معالجة أخطاء معقولة               │
│ ✅ حماية من الفساد (SHA512)          │
│                                     │
│ ⚠️ لكن يحتاج إلى:                   │
│ • فحوصات دورية                      │
│ • نسخ احتياطية                      │
│ • مراقبة مساحة التخزين               │
│ • آليات أكثر قوة للحفاظ على التطابق│
└─────────────────────────────────────┘
```

**التوصية النهائية:**

ربط الأدوات التشخيصية بنظام مراقبة (Monitoring) يعمل على مدار الساعة لضمان سلامة البيانات المستمرة.
