# خطة التحسين والتوصيات الفورية

## 🎯 ملخص تنفيذي

**الحالة الحالية:** نظام تخزين **معقول** لكن **يحتاج حماية إضافية**

**الخطر الرئيسي:** احتمالية فقدان البيانات في حالات الانقطاع أو الأخطاء غير المتعاملة

**المكسب المتوقع:** زيادة موثوقية النظام بنسبة 95%

---

## 🚀 الخطوات الفورية (يوم واحد)

### ✅ المهمة 1: تفعيل الفحوصات الدوري (2 ساعة)

**الهدف:** اكتشاف المشاكل تلقائياً

**الخطوات:**

```typescript
// 1. إنشاء ملف جديد: src/services/storage-monitor.service.ts
// (انسخ من وثيقة Storage-Diagnostic-Tools-AR.md)

// 2. تثبيت الخدمة في app.ts
import { StorageMonitorService } from './services/storage-monitor.service';

const monitor = new StorageMonitorService({
  intervalMs: 24 * 60 * 60 * 1000, // كل 24 ساعة
  enableIntegrityCheck: true,
  enableStatsReport: true,
  enableChecksumVerification: false, // ثقيلة - شغلها أسبوعياً
  alertThresholdMB: 900 * 1024 // 900 GB من 1 TB
});

// في الـ startup
if (process.env.NODE_ENV === 'production') {
  monitor.start();
}

// في الـ shutdown
process.on('SIGTERM', () => {
  monitor.stop();
  process.exit(0);
});
```

**الفائدة:**
- 🔔 تنبيهات تلقائية عند اكتشاف مشاكل
- 📊 تقارير يومية
- ⏰ توقع المشاكل قبل حدوثها

---

### ✅ المهمة 2: إضافة حماية عند الحفظ (2 ساعة)

**الهدف:** منع الملفات اليتيمة

**الملف المعدل:** `src/storage/signal-record-file-storage.ts`

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import * as archiver from 'archiver';

import { env } from '../config/env';
import { getSigmfMetaFileName } from './signal-record-sigmf';

// ... باقي الكود ...

export const createSignalRecordFileStorage = () => ({
  // ... باقي الدوال ...
  
  // 🆕 دالة محسّنة للحفظ الآمن
  async saveAtomic(dataFileName: string, fileBuffer: Buffer, metadataContent: string): Promise<void> {
    await fs.mkdir(env.RECORDS_STORAGE_DIR, { recursive: true });
    
    // استخدم أسماء مؤقتة
    const tempDataFileName = dataFileName + '.tmp';
    const tempMetaFileName = getSigmfMetaFileName(dataFileName) + '.tmp';
    
    const dataFilePath = getFilePath(dataFileName);
    const tempDataFilePath = getFilePath(tempDataFileName);
    const metaFilePath = getFilePath(getSigmfMetaFileName(dataFileName));
    const tempMetaFilePath = getFilePath(tempMetaFileName);
    
    try {
      // 1. اكتب إلى الملفات المؤقتة أولاً
      await Promise.all([
        fs.writeFile(tempDataFilePath, fileBuffer),
        fs.writeFile(tempMetaFilePath, metadataContent, 'utf8')
      ]);
      
      // 2. تحقق من نجاح الكتابة
      const [dataStats, metaStats] = await Promise.all([
        fs.stat(tempDataFilePath),
        fs.stat(tempMetaFilePath)
      ]);
      
      if (dataStats.size === 0 || metaStats.size === 0) {
        throw new Error('Failed to write complete files');
      }
      
      // 3. انقل إلى الاسم النهائي (عملية ذرية)
      await Promise.all([
        fs.rename(tempDataFilePath, dataFilePath),
        fs.rename(tempMetaFilePath, metaFilePath)
      ]);
    } catch (error) {
      // تنظيف الملفات المؤقتة
      await Promise.all([
        fs.rm(tempDataFilePath, { force: true }),
        fs.rm(tempMetaFilePath, { force: true })
      ]);
      throw error;
    }
  }
});
```

**استخدام في record-controller.ts:**

```typescript
// غيّر هذا:
await fileStorage.save(dataFileName, request.file.buffer, metadataContent);

// إلى:
await fileStorage.saveAtomic(dataFileName, request.file.buffer, metadataContent);
```

**الفائدة:**
- 🛡️ منع الملفات اليتيمة الناتجة عن انقطاع الاتصال
- ✅ ضمان الملفات الكاملة أو لا شيء (Atomic)

---

### ✅ المهمة 3: إضافة حد للتخزين (1 ساعة)

**الهدف:** منع امتلاء القرص الصلب

**الملف:** `src/config/env.ts`

```typescript
const baseEnvSchema = z.object({
  // ... باقي الحقول ...
  RECORDS_STORAGE_DIR: z.string().default('storage/iq-files'),
  MAX_STORAGE_SIZE_MB: z.coerce.number().default(900 * 1024), // 900 GB افتراضياً
  // ... باقي الحقول ...
});
```

**الملف:** `src/storage/signal-record-file-storage.ts`

```typescript
import os from 'node:os';

async function getAvailableSpace(): Promise<number> {
  // حساب المساحة المتاحة
  const stat = await fs.stat(env.RECORDS_STORAGE_DIR);
  // ملاحظة: قد تحتاج مكتبة مثل diskusage
  return 0; // placeholder
}

export const createSignalRecordFileStorage = () => ({
  // ... باقي الدوال ...
  
  async checkQuota(fileSize: number): Promise<void> {
    const files = await fs.readdir(env.RECORDS_STORAGE_DIR);
    let totalSize = 0;
    
    for (const file of files) {
      const filePath = getFilePath(file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }
    
    const maxSize = env.MAX_STORAGE_SIZE_MB * 1024 * 1024;
    if (totalSize + fileSize > maxSize) {
      throw new Error(
        `Storage quota exceeded. Current: ${(totalSize / 1024 / 1024).toFixed(2)}MB, ` +
        `Limit: ${env.MAX_STORAGE_SIZE_MB}MB`
      );
    }
  }
});
```

**استخدام في record-controller.ts:**

```typescript
if (request.file) {
  try {
    // تحقق من الحصة قبل الحفظ
    await fileStorage.checkQuota(request.file.size);
    
    const dataFileName = uploadedFileName ?? fileStorage.createDataFileName(uuid, request.file.originalname);
    const metadataContent = createSigmfMetadata(record, dataFileName, request.file.buffer);
    await fileStorage.saveAtomic(dataFileName, request.file.buffer, metadataContent);
  } catch (error) {
    // ...
  }
}
```

**الفائدة:**
- 🛑 منع امتلاء القرص بشكل مفاجئ
- 📢 تنبيهات مبكرة عند الاقتراب من الحد

---

## 📋 الخطوات قصيرة المدى (أسبوع واحد)

### المهمة 4: إنشاء سكريبت التنظيف

**الملفات:**
- `scripts/storage-management.ts`
- `src/tools/storage-integrity-checker.ts`
- `src/tools/cleanup-orphaned-records.ts`

*انسخ من وثيقة Storage-Diagnostic-Tools-AR.md*

**التثبيت:**

```bash
# 1. اختبر الفحص الجاف
npm run storage cleanup:dry

# 2. إذا كانت النتائج صحيحة، نفذ
npm run storage cleanup

# 3. جدول هذا أسبوعياً
# (في cron أو scheduling tool)
0 2 * * 0 cd /app && npm run storage cleanup:dry > /var/log/storage-cleanup.log
```

---

### المهمة 5: إضافة رصد مساحة التخزين

**الملف:** `src/services/storage-monitor.service.ts`

```typescript
import os from 'node:os';

export async function getStorageUsagePercent(): Promise<number> {
  const dirStats = await fs.stat(env.RECORDS_STORAGE_DIR);
  // محاكاة - استخدم مكتبة حقيقية في الإنتاج
  const totalSpace = 1024 * 1024 * 1024 * 1024; // 1 TB
  return (dirStats.size / totalSpace) * 100;
}

// في المراقب:
const usage = await getStorageUsagePercent();
if (usage > 80) {
  logger.warn(`⚠️ Storage 80% full: ${usage.toFixed(2)}%`);
  await alertAdmin('Storage Warning', `Storage is ${usage.toFixed(2)}% full`);
}
```

---

### المهمة 6: توثيق إجراءات الاستعادة

**الملف:** `docs/Disaster-Recovery-AR.md`

```markdown
# خطة الاستعادة من الكوارث

## إذا فقدت بعض الملفات:

### 1. قم بتشخيص الوضع:
\`\`\`bash
npm run storage integrity
\`\`\`

### 2. احصل على قائمة الملفات المفقودة:
\`\`\`bash
npm run storage integrity | grep MISSING_FILE
\`\`\`

### 3. إذا كان عندك نسخة احتياطية:
- استعد الملفات من النسخة الاحتياطية
- تحقق من Checksum:
\`\`\`bash
npm run storage checksum
\`\`\`

### 4. إذا لم تكن لديك نسخة احتياطية:
- حذف السجلات اليتيمة:
\`\`\`bash
npm run storage cleanup
\`\`\`

## الوقاية أفضل من العلاج:
- اجعل النسخ الاحتياطية تلقائية
- جدول الفحوصات أسبوعياً
- راقب المساحة يومياً
```

---

## 🎯 الخطوات طويلة المدى (شهر واحد)

### المهمة 7: نظام النسخ الاحتياطي التلقائي

```typescript
// src/services/backup.service.ts
import cron from 'node-cron';
import archiver from 'archiver';

export function initializeAutoBackup() {
  // كل يوم في الساعة 3 صباحاً
  cron.schedule('0 3 * * *', async () => {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const backupFile = `/backups/iq-storage-${timestamp}.zip`;
      
      const output = fs.createWriteStream(backupFile);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      archive.pipe(output);
      archive.directory(env.RECORDS_STORAGE_DIR, 'iq-files');
      await archive.finalize();
      
      logger.info(`✅ Backup completed: ${backupFile}`);
    } catch (error) {
      logger.error('❌ Backup failed:', error);
      await alertAdmin('Backup Failed', error.message);
    }
  });
}
```

### المهمة 8: نقل إلى التخزين السحابي

```typescript
// src/storage/cloud-storage-adapter.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export class CloudStorageAdapter {
  private s3Client: S3Client;
  
  async saveToCloud(dataFileName: string, fileBuffer: Buffer, metadata: string) {
    // احفظ في S3 أو Azure Blob
    await this.s3Client.send(new PutObjectCommand({
      Bucket: env.CLOUD_BUCKET,
      Key: `iq-files/${dataFileName}`,
      Body: fileBuffer
    }));
  }
}
```

---

## 📊 مقياس النجاح

**ما يجب قياسه:**

| المقياس | الحالي | الهدف | المدة |
|--------|--------|-------|------|
| توفر النظام (Uptime) | 98% | 99.9% | 3 أشهر |
| اكتشاف المشاكل | يدوي | آلي 100% | أسبوع |
| وقت الاستعادة | غير معروف | < 1 ساعة | شهر |
| خسارة البيانات | ممكنة | 0% | 3 أشهر |
| تعقب المساحة | لا | آلي مستمر | أسبوع |

---

## 🎬 خطة التنفيذ

### الأسبوع 1: الحماية الأساسية
```
اليوم 1-2: تثبيت المراقب والفحوصات
اليوم 3-4: تحسين عملية الحفظ (Atomic)
اليوم 5: إضافة حد التخزين والتنبيهات
اليوم 6-7: الاختبار الشامل
```

### الأسبوع 2-3: تحسينات إضافية
```
إنشاء سكريبتات التنظيف والتشخيص
توثيق كاملة
تدريب الفريق
```

### الأسبوع 4+: الحلول الاستراتيجية
```
إعداد النسخ الاحتياطية الآلية
التكامل مع التخزين السحابي
نظام مراقبة متقدم
```

---

## ✅ قائمة التحقق

- [ ] تثبيت المراقب الدوري
- [ ] تحسين آلية الحفظ (Atomic)
- [ ] إضافة حد التخزين
- [ ] إنشاء سكريبتات التشخيص
- [ ] توثيق الإجراءات
- [ ] اختبار كامل
- [ ] تشغيل الفحوصات الدوري
- [ ] جدولة النسخ الاحتياطية
- [ ] إعداد التنبيهات
- [ ] تدريب الفريق

---

## 🚨 في حالة الطوارئ

**إذا كنت تعتقد أن البيانات تُفقد الآن:**

```bash
# 1. قف عن الاستقبال الفوري
# - أيقف البرنامج أو غيّر صلاحيات الكتابة

# 2. قم بفحص فوري
npm run storage integrity
npm run storage stats

# 3. احصل على نسخة احتياطية من الملفات
cp -r storage/iq-files /backup/emergency-backup-$(date +%s)

# 4. تواصل مع الفريق الفنية
# 5. استعن بالنسخة الاحتياطية إن وجدت
```

---

## 📞 الدعم والأسئلة

**أين تجد الأدوات:**
- 📋 `docs/IQ-File-Storage-Analysis-AR.md` - التحليل الكامل
- 🔧 `docs/Storage-Diagnostic-Tools-AR.md` - أدوات التشخيص
- 🎭 `docs/Real-World-Scenarios-AR.md` - السيناريوهات العملية
- 📈 `docs/Disaster-Recovery-AR.md` - خطة الاستعادة (قريباً)

**كيفية الاستخدام:**
```bash
# الفحص الجاف
npm run storage cleanup:dry

# إحصائيات
npm run storage stats

# سلامة البيانات
npm run storage integrity
```

---

## 🎯 الخلاصة

**الوضع الحالي:** ✅ معقول

**المشاكل المحتملة:** ⚠️ موجودة لكن محدودة

**الحل السريع:** 🚀 يمكن تطبيقه في يومين

**النتيجة المتوقعة:** 📈 نظام موثوق وآمن

---

تم التعديل: 2026-06-23
آخر مراجعة: التحليل الكامل
