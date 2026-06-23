# أدوات تشخيص وإصلاح نظام تخزين IQ Files

## 🔧 أدوات التشخيص العملية

### 1. دالة التحقق من سلامة البيانات

```typescript
// src/tools/storage-integrity-checker.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AppDataSource } from '../database/data-source';
import { signalRecordEntity } from '../database/entities/signal-record.entity';
import { env } from '../config/env';

interface IntegrityIssue {
  uuid: string;
  type: 'MISSING_FILE' | 'ORPHANED_FILE' | 'INVALID_CHECKSUM' | 'MISSING_METADATA';
  details: string;
}

export async function checkStorageIntegrity(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];
  const repository = AppDataSource.getRepository(signalRecordEntity);
  
  console.log('🔍 بدء فحص سلامة التخزين...\n');
  
  // 1. التحقق من السجلات بدون ملفات مقابلة
  console.log('1️⃣ التحقق من السجلات بدون ملفات...');
  const records = await repository.find();
  
  for (const record of records) {
    if (!record.iqFile) continue;
    
    const dataFilePath = path.join(env.RECORDS_STORAGE_DIR, record.iqFile);
    const metaFileName = record.iqFile.replace('.sigmf-data', '.sigmf-meta');
    const metaFilePath = path.join(env.RECORDS_STORAGE_DIR, metaFileName);
    
    try {
      // التحقق من وجود ملف البيانات
      await fs.access(dataFilePath);
    } catch {
      issues.push({
        uuid: record.uuid,
        type: 'MISSING_FILE',
        details: `ملف البيانات مفقود: ${record.iqFile}`
      });
      continue;
    }
    
    try {
      // التحقق من وجود ملف البيانات الوصفية
      await fs.access(metaFilePath);
    } catch {
      issues.push({
        uuid: record.uuid,
        type: 'MISSING_METADATA',
        details: `ملف البيانات الوصفية مفقود: ${metaFileName}`
      });
    }
  }
  
  // 2. التحقق من الملفات اليتيمة
  console.log('2️⃣ التحقق من الملفات اليتيمة...');
  const files = await fs.readdir(env.RECORDS_STORAGE_DIR);
  const registeredFiles = new Set(
    records
      .filter(r => r.iqFile)
      .flatMap(r => [
        r.iqFile!,
        r.iqFile!.replace('.sigmf-data', '.sigmf-meta')
      ])
  );
  
  for (const file of files) {
    if (file.endsWith('.sigmf-data') && !registeredFiles.has(file)) {
      issues.push({
        uuid: 'UNKNOWN',
        type: 'ORPHANED_FILE',
        details: `ملف يتيم بدون سجل في البيانات: ${file}`
      });
    }
  }
  
  return issues;
}

// دالة الطباعة الجميلة للنتائج
export async function printIntegrityReport(): Promise<void> {
  const issues = await checkStorageIntegrity();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 تقرير سلامة التخزين');
  console.log('='.repeat(60) + '\n');
  
  if (issues.length === 0) {
    console.log('✅ لا توجد مشاكل - التخزين سليم!\n');
    return;
  }
  
  console.log(`⚠️ تم اكتشاف ${issues.length} مشاكل:\n`);
  
  const grouped = issues.reduce((acc, issue) => {
    acc[issue.type] = (acc[issue.type] || []).concat(issue);
    return acc;
  }, {} as Record<string, IntegrityIssue[]>);
  
  Object.entries(grouped).forEach(([type, typeIssues]) => {
    console.log(`\n📌 ${type} (${typeIssues.length}):`);
    typeIssues.forEach(issue => {
      console.log(`   • UUID: ${issue.uuid}`);
      console.log(`     ${issue.details}\n`);
    });
  });
  
  console.log('='.repeat(60) + '\n');
}
```

### 2. دالة الحصول على إحصائيات التخزين

```typescript
// src/tools/storage-stats.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { AppDataSource } from '../database/data-source';
import { signalRecordEntity } from '../database/entities/signal-record.entity';
import { env } from '../config/env';

export async function getStorageStats() {
  const repository = AppDataSource.getRepository(signalRecordEntity);
  
  // عد السجلات
  const totalRecords = await repository.count();
  
  // حساب حجم الملفات
  let totalSize = 0;
  let fileCount = 0;
  
  const files = await fs.readdir(env.RECORDS_STORAGE_DIR);
  for (const file of files) {
    const filePath = path.join(env.RECORDS_STORAGE_DIR, file);
    const stats = await fs.stat(filePath);
    totalSize += stats.size;
    fileCount++;
  }
  
  // معلومات عن أكبر الملفات
  const records = await repository.find();
  const fileSizes: { uuid: string; fileName: string; size: number }[] = [];
  
  for (const record of records) {
    if (!record.iqFile) continue;
    
    const filePath = path.join(env.RECORDS_STORAGE_DIR, record.iqFile);
    try {
      const stats = await fs.stat(filePath);
      fileSizes.push({
        uuid: record.uuid,
        fileName: record.iqFile,
        size: stats.size
      });
    } catch {
      // ملف مفقود
    }
  }
  
  fileSizes.sort((a, b) => b.size - a.size);
  
  return {
    totalRecords,
    totalFiles: fileCount,
    totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    averageFileSizeMB: (totalSize / fileCount / 1024 / 1024).toFixed(2),
    largestFiles: fileSizes.slice(0, 10)
  };
}

export async function printStorageStats(): Promise<void> {
  const stats = await getStorageStats();
  
  console.log('\n' + '='.repeat(60));
  console.log('💾 إحصائيات التخزين');
  console.log('='.repeat(60) + '\n');
  
  console.log(`📝 إجمالي السجلات: ${stats.totalRecords}`);
  console.log(`📄 إجمالي الملفات: ${stats.totalFiles}`);
  console.log(`📊 إجمالي الحجم: ${stats.totalSize.toLocaleString()} بايت`);
  console.log(`📈 إجمالي الحجم: ${stats.totalSizeMB} MB\n`);
  
  console.log(`⚙️ متوسط حجم الملف: ${stats.averageFileSizeMB} MB\n`);
  
  console.log('🔟 أكبر 10 ملفات:');
  console.log('-'.repeat(60));
  
  stats.largestFiles.forEach((file, index) => {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    console.log(`${index + 1}. ${file.fileName}`);
    console.log(`   الحجم: ${sizeMB} MB`);
    console.log(`   UUID: ${file.uuid}\n`);
  });
  
  console.log('='.repeat(60) + '\n');
}
```

### 3. دالة التحقق من Checksum

```typescript
// src/tools/checksum-verifier.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AppDataSource } from '../database/data-source';
import { signalRecordEntity } from '../database/entities/signal-record.entity';
import { env } from '../config/env';

interface ChecksumResult {
  uuid: string;
  fileName: string;
  storedChecksum: string | null;
  calculatedChecksum: string;
  isValid: boolean;
  details: string;
}

export async function verifyChecksums(): Promise<ChecksumResult[]> {
  const repository = AppDataSource.getRepository(signalRecordEntity);
  const records = await repository.find();
  const results: ChecksumResult[] = [];
  
  console.log('🔐 بدء التحقق من Checksums...\n');
  
  for (const record of records) {
    if (!record.iqFile) continue;
    
    const dataFilePath = path.join(env.RECORDS_STORAGE_DIR, record.iqFile);
    const metaFileName = record.iqFile.replace('.sigmf-data', '.sigmf-meta');
    const metaFilePath = path.join(env.RECORDS_STORAGE_DIR, metaFileName);
    
    try {
      // قراءة ملف البيانات
      const fileBuffer = await fs.readFile(dataFilePath);
      
      // حساب Checksum
      const calculatedChecksum = createHash('sha512')
        .update(fileBuffer)
        .digest('hex');
      
      // قراءة البيانات الوصفية
      let storedChecksum: string | null = null;
      try {
        const metaContent = await fs.readFile(metaFilePath, 'utf-8');
        const metadata = JSON.parse(metaContent);
        storedChecksum = metadata.global?.['core:sha512'] || null;
      } catch {
        // قد لا يكون هناك ملف metadata
      }
      
      const isValid = !storedChecksum || storedChecksum === calculatedChecksum;
      
      results.push({
        uuid: record.uuid,
        fileName: record.iqFile,
        storedChecksum,
        calculatedChecksum,
        isValid,
        details: isValid
          ? '✅ صحيح'
          : '❌ غير متطابق! قد يشير إلى تلف في الملف'
      });
    } catch (error) {
      results.push({
        uuid: record.uuid,
        fileName: record.iqFile,
        storedChecksum: null,
        calculatedChecksum: 'ERROR',
        isValid: false,
        details: `❌ خطأ في القراءة: ${(error as Error).message}`
      });
    }
  }
  
  return results;
}

export async function printChecksumReport(): Promise<void> {
  const results = await verifyChecksums();
  
  console.log('\n' + '='.repeat(60));
  console.log('🔐 تقرير التحقق من Checksums');
  console.log('='.repeat(60) + '\n');
  
  const valid = results.filter(r => r.isValid).length;
  const invalid = results.filter(r => !r.isValid).length;
  
  console.log(`✅ ملفات صحيحة: ${valid}`);
  console.log(`❌ ملفات بها مشاكل: ${invalid}\n`);
  
  if (invalid > 0) {
    console.log('⚠️ الملفات التي بها مشاكل:\n');
    
    results
      .filter(r => !r.isValid)
      .forEach(result => {
        console.log(`📌 ${result.fileName}`);
        console.log(`   UUID: ${result.uuid}`);
        console.log(`   الحالة: ${result.details}\n`);
      });
  }
  
  console.log('='.repeat(60) + '\n');
}
```

---

## 🛠️ وظائف الإصلاح والتنظيف

### 1. دالة حذف السجلات اليتيمة

```typescript
// src/tools/cleanup-orphaned-records.ts
import { AppDataSource } from '../database/data-source';
import { signalRecordEntity } from '../database/entities/signal-record.entity';
import { createSignalRecordFileStorage } from '../storage/signal-record-file-storage';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

export async function cleanupOrphanedRecords(dryRun = true): Promise<void> {
  const repository = AppDataSource.getRepository(signalRecordEntity);
  const fileStorage = createSignalRecordFileStorage();
  
  console.log(`\n🧹 بدء تنظيف السجلات اليتيمة (Dry Run: ${dryRun})...\n`);
  
  const records = await repository.find();
  let deletedCount = 0;
  
  for (const record of records) {
    if (!record.iqFile) continue;
    
    // التحقق من وجود الملف
    const exists = await fileStorage.exists(record.iqFile);
    
    if (!exists) {
      console.log(`🗑️ حذف السجل: ${record.uuid}`);
      console.log(`   الملف المفقود: ${record.iqFile}\n`);
      
      if (!dryRun) {
        await repository.delete({ uuid: record.uuid });
        deletedCount++;
      }
    }
  }
  
  console.log(`${'='.repeat(60)}`);
  if (dryRun) {
    console.log(`📊 سيتم حذف: ${deletedCount} سجل (في الوضع الفعلي)`);
  } else {
    console.log(`✅ تم حذف: ${deletedCount} سجل`);
  }
  console.log(`${'='.repeat(60)}\n`);
}

// مثال الاستخدام:
// await cleanupOrphanedRecords(true);  // دراسة جافة أولاً
// await cleanupOrphanedRecords(false); // تنفيذ فعلي
```

### 2. دالة حذف الملفات اليتيمة

```typescript
// src/tools/cleanup-orphaned-files.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppDataSource } from '../database/data-source';
import { signalRecordEntity } from '../database/entities/signal-record.entity';
import { env } from '../config/env';

export async function cleanupOrphanedFiles(dryRun = true): Promise<void> {
  const repository = AppDataSource.getRepository(signalRecordEntity);
  
  console.log(`\n🧹 بدء تنظيف الملفات اليتيمة (Dry Run: ${dryRun})...\n`);
  
  const records = await repository.find();
  const registeredFiles = new Set(
    records
      .filter(r => r.iqFile)
      .flatMap(r => [
        r.iqFile!,
        r.iqFile!.replace('.sigmf-data', '.sigmf-meta')
      ])
  );
  
  const files = await fs.readdir(env.RECORDS_STORAGE_DIR);
  let deletedCount = 0;
  
  for (const file of files) {
    if (!registeredFiles.has(file)) {
      const filePath = path.join(env.RECORDS_STORAGE_DIR, file);
      console.log(`🗑️ حذف الملف اليتيم: ${file}\n`);
      
      if (!dryRun) {
        await fs.rm(filePath, { force: true });
        deletedCount++;
      }
    }
  }
  
  console.log(`${'='.repeat(60)}`);
  if (dryRun) {
    console.log(`📊 سيتم حذف: ${deletedCount} ملف (في الوضع الفعلي)`);
  } else {
    console.log(`✅ تم حذف: ${deletedCount} ملف`);
  }
  console.log(`${'='.repeat(60)}\n`);
}
```

---

## 📋 سكريبت مراقبة دوري

```typescript
// src/services/storage-monitor.service.ts
import { logger } from '../utils/logger';
import {
  printIntegrityReport,
  printStorageStats,
  printChecksumReport
} from '../tools';

interface StorageMonitorConfig {
  intervalMs: number;
  enableIntegrityCheck: boolean;
  enableStatsReport: boolean;
  enableChecksumVerification: boolean;
  alertThresholdMB: number;
}

export class StorageMonitorService {
  private interval: NodeJS.Timeout | null = null;
  
  constructor(private config: StorageMonitorConfig) {}
  
  start(): void {
    logger.info('🔍 بدء مراقبة التخزين...');
    
    this.interval = setInterval(async () => {
      try {
        if (this.config.enableIntegrityCheck) {
          await printIntegrityReport();
        }
        
        if (this.config.enableStatsReport) {
          await printStorageStats();
        }
        
        if (this.config.enableChecksumVerification) {
          await printChecksumReport();
        }
      } catch (error) {
        logger.error('خطأ في مراقبة التخزين:', error);
      }
    }, this.config.intervalMs);
  }
  
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      logger.info('✅ توقفت مراقبة التخزين');
    }
  }
}
```

---

## 📦 نموذج سطر أوامر (CLI)

```typescript
// scripts/storage-management.ts
import { AppDataSource } from '../src/database/data-source';
import {
  printIntegrityReport,
  printStorageStats,
  printChecksumReport,
  cleanupOrphanedRecords,
  cleanupOrphanedFiles
} from '../src/tools';

async function main() {
  const command = process.argv[2];
  
  // تهيئة الاتصال بقاعدة البيانات
  await AppDataSource.initialize();
  
  try {
    switch (command) {
      case 'integrity':
        await printIntegrityReport();
        break;
        
      case 'stats':
        await printStorageStats();
        break;
        
      case 'checksum':
        await printChecksumReport();
        break;
        
      case 'cleanup:dry':
        console.log('🧹 وضع المحاكاة:');
        await cleanupOrphanedRecords(true);
        await cleanupOrphanedFiles(true);
        break;
        
      case 'cleanup':
        console.log('⚠️ وضع التنفيذ الفعلي!');
        console.log('هل أنت متأكد؟ (نعم/لا)');
        
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        rl.question('أكد (نعم): ', async (answer) => {
          if (answer.toLowerCase() === 'نعم' || answer.toLowerCase() === 'yes') {
            await cleanupOrphanedRecords(false);
            await cleanupOrphanedFiles(false);
          } else {
            console.log('✅ تم الإلغاء');
          }
          rl.close();
        });
        break;
        
      case 'all':
        await printStorageStats();
        await printIntegrityReport();
        await printChecksumReport();
        break;
        
      default:
        console.log(`
🔧 أوامر إدارة التخزين:

  npm run storage integrity  - فحص سلامة البيانات
  npm run storage stats      - إحصائيات التخزين
  npm run storage checksum   - التحقق من Checksums
  npm run storage cleanup:dry  - محاكاة التنظيف
  npm run storage cleanup    - تنفيذ التنظيف الفعلي
  npm run storage all        - تشغيل جميع الفحوصات
        `);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch(error => {
  console.error('❌ خطأ:', error);
  process.exit(1);
});
```

---

## 🚀 التكامل مع package.json

أضف هذه الأسطر إلى `package.json`:

```json
{
  "scripts": {
    "storage": "tsx scripts/storage-management.ts",
    "storage:check": "npm run storage integrity stats checksum",
    "storage:cleanup:dry": "npm run storage cleanup:dry",
    "storage:cleanup": "npm run storage cleanup"
  }
}
```

---

## 📊 أمثلة الاستخدام

### فحص سلامة البيانات:
```bash
npm run storage integrity
```

### الحصول على إحصائيات:
```bash
npm run storage stats
```

### التحقق من Checksums:
```bash
npm run storage checksum
```

### محاكاة التنظيف (آمن):
```bash
npm run storage cleanup:dry
```

### التنظيف الفعلي:
```bash
npm run storage cleanup
```

### فحص شامل:
```bash
npm run storage all
```

---

## ⚠️ ملاحظات مهمة

1. **أنشئ نسخة احتياطية قبل التنظيف الفعلي**
2. **ابدأ دائماً بـ dry run أولاً**
3. **قم بتشغيل الفحوصات بانتظام**
4. **احتفظ بسجلات الأخطاء**
5. **راقب استخدام التخزين بشكل دوري**
