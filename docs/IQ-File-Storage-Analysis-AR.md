# تحليل نظام تخزين ملفات IQ

## 📋 ملخص تنفيذي

نظام تخزين ملفات IQ في التطبيق يتبع نموذج **هجين (Hybrid)** يجمع بين:
- **نظام الملفات (File System):** لتخزين البيانات الخام IQ والبيانات الوصفية
- **قاعدة البيانات (MySQL):** لتخزين المعلومات والفهارس والبيانات الوصفية الإضافية

---

## 🏗️ البنية المعمارية لتخزين IQ Files

### 1. تدفق العملية الرئيسية

```
┌─────────────────────────────────────────────────────────┐
│ المستخدم يرفع ملف IQ                                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
         ┌────────────────────────┐
         │ المراقب (Controller)   │
         │ record-controller.ts   │
         └────────────┬───────────┘
                      │
         ┌────────────▼─────────────────────────┐
         │ 1. إنشاء UUID فريد للسجل             │
         │ 2. معالجة بيانات الصيغة SigMF       │
         │ 3. حساب SHA512 Checksum            │
         └────────────┬─────────────────────────┘
                      │
         ┌────────────▼─────────────────────────┐
         │ حفظ البيانات في مسارين:             │
         │                                     │
         │ أ) File System:                     │
         │    storage/iq-files/               │
         │    ├── {name}-{uuid}.sigmf-data    │
         │    └── {name}-{uuid}.sigmf-meta    │
         │                                     │
         │ ب) قاعدة البيانات:                  │
         │    signal_records table            │
         └────────────┬─────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │ إرجاع رابط التحميل      │
         │ للمستخدم             │
         └────────────────────────┘
```

### 2. آليات التخزين التفصيلية

#### أ) تخزين الملفات على File System

**الملف المسؤول:** `src/storage/signal-record-file-storage.ts`

```typescript
// هيكل أسماء الملفات
{name}-{uuid}.sigmf-data    // ملف البيانات الخام
{name}-{uuid}.sigmf-meta    // ملف البيانات الوصفية (JSON)
```

**الموقع الافتراضي:**
```
storage/iq-files/
├── recording-5f43bf0f-2cc9-4bbe-8064-2a953e16c1d1.sigmf-data
├── recording-5f43bf0f-2cc9-4bbe-8064-2a953e16c1d1.sigmf-meta
├── recording-c901caf3-7504-47dc-968a-e07b62597e0f.sigmf-data
└── recording-c901caf3-7504-47dc-968a-e07b62597e0f.sigmf-meta
```

**عملية الحفظ:**
```typescript
async save(dataFileName: string, fileBuffer: Buffer, metadataContent: string): Promise<void> {
  await fs.mkdir(env.RECORDS_STORAGE_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(getFilePath(dataFileName), fileBuffer),
    fs.writeFile(getFilePath(getSigmfMetaFileName(dataFileName)), metadataContent, 'utf8')
  ]);
}
```

✅ **النقطة الإيجابية:** يتم حفظ الملفات بشكل متزامن (Parallel) لضمان الأداء.

#### ب) تخزين البيانات الوصفية في قاعدة البيانات

**الجدول:** `signal_records`

**الحقول المسجلة:**

| الحقل | النوع | الوصف |
|------|-------|-------|
| `uuid` | VARCHAR(36) | معرف فريد أساسي |
| `iq_file` | VARCHAR(255) | اسم ملف الـ IQ المخزن |
| `sample_rate` | DOUBLE | معدل المعاينات (Hz) |
| `data_type` | VARCHAR(100) | نوع البيانات (cf32_le, rf32_le, وغيرها) |
| `num_channels` | INT | عدد قنوات الاستقبال |
| `core:sha512` | VARCHAR(128) | Checksum للتحقق من السلامة |
| `antenna_*` | VARIOUS | معلومات الهوائي (النوع، التردد، الكسب، إلخ) |
| `time_date` | DATETIME | وقت التسجيل |
| `location` | VARCHAR(255) | موقع التسجيل الجغرافي |
| `threat_score` | DOUBLE | درجة التهديد |
| `extensions` | JSON | حقل مرن للإضافات المستقبلية |

---

## 📊 صيغة SigMF (Signal Metadata Format)

### ما هي صيغة SigMF؟

**SigMF** هي معيار مفتوح المصدر لوصف البيانات الخام للإشارات الراديوية. تتكون من:
- **ملف البيانات** (`.sigmf-data`): البيانات الخام للإشارة
- **ملف البيانات الوصفية** (`.sigmf-meta`): وصف البيانات بصيغة JSON

### مثال على ملف البيانات الوصفية

```json
{
  "global": {
    "core:datatype": "cf32_le",
    "core:sample_rate": 1000000,
    "core:version": "1.2.6",
    "core:author": "DMR Classifier System",
    "core:description": "Signal recording from field",
    "core:sha512": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6...",
    "core:num_channels": 1,
    "core:offset": 0,
    "core:recorder": "USRP B210",
    "antenna:type": "Omnidirectional",
    "antenna:gain": 20.5,
    "antenna:low_frequency": 400000000,
    "antenna:high_frequency": 500000000
  }
}
```

**الفوائد:**
- ✅ توثيق شامل للبيانات
- ✅ قابلية التبادل بين الأنظمة المختلفة
- ✅ حفظ Metadata بطريقة معيارية

---

## ✅ جوانب التخزين الصحيحة

### 1. **التحقق من السلامة (Data Integrity)**

```typescript
'core:sha512': createHash('sha512').update(dataFileBuffer).digest('hex')
```

- يتم حساب Checksum SHA512 لكل ملف
- يمكن التحقق منه لاحقاً للتأكد من عدم تلف الملف

### 2. **معالجة الأخطاء والتراجع (Transaction Rollback)**

```typescript
if (request.file) {
  try {
    const dataFileName = uploadedFileName ?? fileStorage.createDataFileName(uuid, request.file.originalname);
    const metadataContent = createSigmfMetadata(record, dataFileName, request.file.buffer);
    await fileStorage.save(dataFileName, request.file.buffer, metadataContent);
  } catch (error) {
    // حذف السجل من قاعدة البيانات في حالة الفشل
    await service.deleteByUuid(record.uuid);
    if (uploadedFileName) {
      await fileStorage.remove(uploadedFileName);
    }
    throw error;  // إعادة رفع الخطأ
  }
}
```

✅ النقاط الإيجابية:
- إذا حدث خطأ أثناء حفظ الملف، يتم حذف السجل من البيانات
- يتم حذف أي ملفات جزئية تم إنشاؤها
- عدم ترك بيانات غير متطابقة

### 3. **التحقق من وجود الملفات**

```typescript
async exists(dataFileName: string): Promise<boolean> {
  try {
    await Promise.all([
      fs.access(getFilePath(dataFileName)), 
      fs.access(getFilePath(getSigmfMetaFileName(dataFileName)))
    ]);
    return true;
  } catch {
    return false;
  }
}
```

✅ التحقق المزدوج:
- التحقق من وجود ملف البيانات
- التحقق من وجود ملف البيانات الوصفية

### 4. **تسميات فريدة للملفات**

```typescript
const createUniqueBaseName = (uuid: string, fileName: string): string => {
  const sanitizedBaseName = sanitizeBaseName(fileName);
  return `${sanitizedBaseName}-${uuid}`;
};
```

✅ الفائدة:
- منع تضارب الأسماء
- ربط واضح بين الملفات و السجلات

---

## ⚠️ المشاكل المحتملة والمخاطر

### 1. **عدم تطابق البيانات (Data Mismatch)**

**المشكلة:**
- يمكن حذف ملف من File System مباشرة دون حذف السجل من DB
- أو العكس: حذف السجل دون حذف الملف

**السيناريو المقلق:**

```
┌─────────────────────────────────────────────┐
│ الملف يُحذف من storage/iq-files/           │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ السجل باقٍ في قاعدة البيانات               │
│ يشير إلى ملف غير موجود!                    │
└─────────────────────────────────────────────┘
```

**النتيجة:**
- ❌ طلب تحميل الملف يفشل
- ❌ بيانات يتيمة في البيانات

### 2. **فقدان الملفات في حالات الانقطاع**

**المشكلة:**
- إذا انقطع الاتصال أثناء الحفظ

**السيناريو:**

```
الخطوة 1: حفظ ملف البيانات ✓
Waiting for..., يحدث انقطاع الاتصال
الخطوة 2: حفظ البيانات الوصفية ✗ (فشل)
النتيجة: ملف بيانات يتيم بدون metadata!
```

### 3. **عدم وجود آلية النسخ الاحتياطي**

**المشكلة:**
- لا توجد آلية تلقائية للنسخ الاحتياطية
- فقدان كل شيء إذا حدث عطل في الخادم

### 4. **سعة التخزين غير المحدودة**

```typescript
RECORDS_STORAGE_DIR: z.string().default('storage/iq-files')
```

**المشكلة:**
- لا يوجد حد أقصى لحجم التخزين
- قد تمتلئ القرص الصلب تماماً

---

## 🔍 تشخيص المشاكل الحالية

### للتحقق من سلامة البيانات:

```sql
-- 1. البحث عن سجلات بدون ملفات مقابلة
SELECT uuid, iq_file FROM signal_records 
WHERE iq_file IS NOT NULL;

-- 2. التحقق من عدد الملفات المخزنة
-- استخدم: ls -la storage/iq-files/

-- 3. البحث عن ملفات بدون سجلات في البيانات
-- قارن الملفات الموجودة مع السجلات
```

### دالة تشخيصية مقترحة:

```typescript
async function validateStorageIntegrity() {
  const service = createSignalRecordService();
  const fileStorage = createSignalRecordFileStorage();
  
  const records = await service.findAll();
  const issues: any[] = [];
  
  for (const record of records) {
    if (record.iqFile && !(await fileStorage.exists(record.iqFile))) {
      issues.push({
        uuid: record.uuid,
        issue: 'FILE_MISSING',
        iqFile: record.iqFile
      });
    }
  }
  
  return issues;
}
```

---

## 🛠️ التحسينات المقترحة

### 1. **حماية عمليات الحفظ (Atomic Operations)**

```typescript
async save(dataFileName: string, fileBuffer: Buffer, metadataContent: string): Promise<void> {
  // حفظ في ملفات مؤقتة أولاً
  const tempDataFile = dataFileName + '.tmp';
  const tempMetaFile = getSigmfMetaFileName(dataFileName) + '.tmp';
  
  try {
    // حفظ في الملفات المؤقتة
    await Promise.all([
      fs.writeFile(getFilePath(tempDataFile), fileBuffer),
      fs.writeFile(getFilePath(tempMetaFile), metadataContent, 'utf8')
    ]);
    
    // إذا نجح، نقل إلى الاسم النهائي
    await Promise.all([
      fs.rename(getFilePath(tempDataFile), getFilePath(dataFileName)),
      fs.rename(getFilePath(tempMetaFile), getFilePath(getSigmfMetaFileName(dataFileName)))
    ]);
  } catch (error) {
    // حذف الملفات المؤقتة
    await Promise.all([
      fs.rm(getFilePath(tempDataFile), { force: true }),
      fs.rm(getFilePath(tempMetaFile), { force: true })
    ]);
    throw error;
  }
}
```

### 2. **إضافة حد أقصى لسعة التخزين**

```typescript
const MAX_STORAGE_SIZE = 1000 * 1024 * 1024 * 1024; // 1 TB

async save(dataFileName: string, fileBuffer: Buffer, metadataContent: string): Promise<void> {
  const totalSize = fileBuffer.length + metadataContent.length;
  const currentSize = await getDirectorySize(env.RECORDS_STORAGE_DIR);
  
  if (currentSize + totalSize > MAX_STORAGE_SIZE) {
    throw new Error('Storage quota exceeded');
  }
  
  // ... باقي الكود
}
```

### 3. **آلية التحقق الدوري**

```typescript
async function verifyStorageIntegrity() {
  const issues = await validateStorageIntegrity();
  
  if (issues.length > 0) {
    logger.error(`Storage integrity issues found: ${issues.length}`);
    // إرسال تنبيه
    // حذف السجلات اليتيمة تلقائياً أو تحذير المسؤول
  }
}

// تشغيل التحقق كل ساعة
setInterval(verifyStorageIntegrity, 60 * 60 * 1000);
```

### 4. **حفظ النسخ الاحتياطية**

```typescript
async backup(archiveFileName: string): Promise<void> {
  const backupDir = path.join(env.RECORDS_STORAGE_DIR, 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  
  const archive = archiver('zip');
  archive.pipe(fs.createWriteStream(path.join(backupDir, archiveFileName)));
  archive.directory(env.RECORDS_STORAGE_DIR, false);
  await archive.finalize();
}
```

---

## 📈 الخلاصة والتوصيات

### الحالة الحالية: ✅ **جيدة بشكل عام**

**الإيجابيات:**
- ✅ نظام منظم ومعياري (SigMF)
- ✅ معالجة أخطاء جيدة عند الحفظ
- ✅ Checksum للتحقق من السلامة
- ✅ UUID فريد لكل سجل

**المشاكل:**
- ⚠️ احتمالية عدم تطابق البيانات
- ⚠️ عدم وجود نسخ احتياطية تلقائية
- ⚠️ قد تمتلئ مساحة التخزين

### التوصيات الفورية:

1. **قصيرة الأجل:**
   - تشغيل دالة التحقق من السلامة دورياً
   - توثيق إجراءات النسخ الاحتياطي اليدوي

2. **متوسطة الأجل:**
   - إضافة نظام مراقبة مساحة التخزين
   - تطبيق آليات الحفظ الآمن

3. **طويلة الأجل:**
   - نقل التخزين إلى نظام سحابي (S3, Azure Blob)
   - إضافة نسخ احتياطية تلقائية
   - نظام إدارة دورة حياة الملفات (Retention Policy)

---

## 📚 المراجع

- **SigMF Standard:** https://github.com/gnuradio/SigMF
- **TypeORM Documentation:** https://typeorm.io/
- **Node.js File System:** https://nodejs.org/api/fs.html
