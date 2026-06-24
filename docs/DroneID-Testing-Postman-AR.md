# 🧪 اختبار DroneID Service على Postman

## ✅ التحقق من جاهزية النظام

### 1️⃣ التأكد من تشغيل الخادم

```bash
npm run build
npm run start
```

**الإخراج المتوقع:**
```
Server is running on http://0.0.0.0:3000
Socket server listening on /socket.io
```

### 2️⃣ فحص الاتصال بـ gRPC

قبل البدء، تأكد من:
- ✅ `DroneIDService` موجود في `.env` → `GRPC_SERVICE_TARGETS`
- ✅ البورت: `172.20.20.99:5055`
- ✅ خادم gRPC يعمل على هذا العنوان/البورت

---

## 🔌 اختبار Socket.IO على Postman

### الخطوة 1: فتح Postman

- Windows/Mac: `Cmd+Shift+P` → اكتب "Postman"
- أو افتح التطبيق مباشرة

### الخطوة 2: إنشاء Socket.IO Request جديد

1. **انقر**: `New` → `WebSocket`
2. **أدخل الـ URL**: 
```
ws://localhost:3000/socket.io/?transport=websocket
```
3. **اضغط**: `Connect`

**النتيجة المتوقعة:**
```
✅ Connected
```

---

## 📨 إرسال الطلبات

### 1️⃣ استقبال قائمة الخدمات (grpc:methods)

**الحدث**: `grpc:methods` يصل تلقائياً

**الرسالة المتوقعة**:
```json
{
  "methods": [
    {
      "serviceName": "DroneIDService",
      "methodName": "StreamDrones",
      "requestEvent": "grpc:invoke:DroneIDService.StreamDrones",
      "responseEvent": "DroneIDService.StreamDrones",
      "responseStream": true
    },
    {
      "serviceName": "DroneIDService",
      "methodName": "GetStatus",
      "requestEvent": "grpc:invoke:DroneIDService.GetStatus",
      "responseEvent": "DroneIDService.GetStatus",
      "responseStream": false
    },
    {
      "serviceName": "DroneIDService",
      "methodName": "GetAntSDRStatus",
      "requestEvent": "grpc:invoke:DroneIDService.GetAntSDRStatus",
      "responseEvent": "DroneIDService.GetAntSDRStatus",
      "responseStream": false
    }
  ]
}
```

✅ **إذا رأيت DroneIDService → الاتصال بنجح!**

---

### 2️⃣ استدعاء StreamDrones (بدء كشف الطائرات)

**الحدث**: `grpc:invoke:DroneIDService.StreamDrones`

**الرسالة (JSON)**:
```json
{
  "connectionType": "CONNECTION_ETHERNET",
  "protocol": "PROTOCOL_DJI",
  "antsdrIp": "172.31.100.2",
  "listenPort": 52002,
  "zmqEndpoint": "tcp://127.0.0.1:4221"
}
```

**أو (USB Serial)**:
```json
{
  "connectionType": "CONNECTION_USB_SERIAL",
  "protocol": "PROTOCOL_DJI",
  "serialPort": "/dev/ttyUSB0",
  "baudRate": 115200
}
```

**النتيجة المتوقعة**:
- ستتلقى سلسلة من الأحداث `DroneIDService.StreamDrones`
- كل حدث يحتوي على بيانات طائرة، إشارة خام، أو رسالة حالة

**مثال الرد**:
```json
{
  "drone": {
    "serial": "0CFUHP5H1B3D45",
    "protocol": "DJI-O3",
    "droneLat": 24.7136,
    "droneLon": 46.6753,
    "altitudeM": 50.5,
    "speedMs": 10.2,
    "homeLat": 24.7140,
    "homeLon": 46.6750,
    "pilotLat": 24.7150,
    "pilotLon": 46.6745,
    "rssi": -65,
    "description": "Phantom 4 Pro",
    "motorOn": true,
    "inAir": true,
    "gpsValid": true,
    "vNorthCms": 500,
    "vEastCms": -200,
    "vUpCms": 50,
    "stateInfo": "Flying"
  }
}
```

---

### 3️⃣ استدعاء GetStatus (حالة الخدمة)

**الحدث**: `grpc:invoke:DroneIDService.GetStatus`

**الرسالة (JSON)**:
```json
{}
```

**النتيجة المتوقعة**:
```json
{
  "running": true,
  "uptimeMs": "1234567",
  "droneCount": 3,
  "activeStreams": 1,
  "lastSignalMs": "1719244800000"
}
```

---

### 4️⃣ استدعاء GetAntSDRStatus (حالة الجهاز)

**الحدث**: `grpc:invoke:DroneIDService.GetAntSDRStatus`

**الرسالة (JSON)**:
```json
{}
```

**النتيجة المتوقعة**:
```json
{
  "connected": true,
  "source": "CONNECTION_ETHERNET",
  "lastSignalMs": "1719244799500",
  "model": "ANTSDR E200",
  "firmwareVersion": "v1.2.3"
}
```

---

## 📋 جدول الأحداث الكاملة

| الحدث | النوع | البيانات المُرسلة | الرد |
|------|------|-----------------|------|
| `grpc:invoke:DroneIDService.StreamDrones` | Request | StreamRequest | DronePayload (stream) |
| `DroneIDService.StreamDrones` | Response | DronePayload | (مستمر حتى الإلغاء) |
| `grpc:invoke:DroneIDService.GetStatus` | Request | StatusRequest | ServiceStatus |
| `DroneIDService.GetStatus` | Response | ServiceStatus | (مرة واحدة) |
| `grpc:invoke:DroneIDService.GetAntSDRStatus` | Request | StatusRequest | AntSDRStatus |
| `DroneIDService.GetAntSDRStatus` | Response | AntSDRStatus | (مرة واحدة) |
| `grpc:error` | Error | (خطأ) | رسالة خطأ |
| `grpc:result` | Ack | (إقرار) | {success: true/false} |

---

## ⚠️ معالجة الأخطاء

### إذا لم تتلقَّ أي رسالة:

1. **تحقق من الاتصال**:
   ```
   ✅ WebSocket متصل؟
   ✅ سيرفر يعمل؟
   ✅ Postman منفتح؟
   ```

2. **تحقق من الأخطاء**:
   - افتح Console في Postman: `Cmd+Alt+C`
   - تحقق من `grpc:error` events

3. **أخطاء شائعة**:
   ```
   ❌ "UNAVAILABLE" → خادم gRPC غير متصل (172.20.20.99:5055)
   ❌ "INVALID_ARGUMENT" → معاملات خاطئة في الطلب
   ❌ "TIMEOUT" → الخادم لم يرد في الوقت المحدد
   ```

---

## 📊 مثال اختبار كامل

```
1️⃣ Connect WebSocket → ws://localhost:3000/socket.io/?transport=websocket
   ✅ استقبل: grpc:methods (يتضمن DroneIDService)

2️⃣ Send: grpc:invoke:DroneIDService.StreamDrones
   📤 {"connectionType":"CONNECTION_ETHERNET","protocol":"PROTOCOL_DJI"}
   
3️⃣ استقبل: DroneIDService.StreamDrones (دفقة مستمرة)
   📥 {"drone": {...}}
   📥 {"statusMessage": "Connected to ANTSDR"}
   📥 {"rawSignal": {...}}
   ...

4️⃣ Send: grpc:invoke:DroneIDService.GetStatus
   📤 {}
   
5️⃣ استقبل: DroneIDService.GetStatus
   📥 {"running": true, "droneCount": 3}

6️⃣ Disconnect WebSocket
   ✅ StreamDrones توقف تلقائياً
```

---

## 🎯 خطوات التطوير التالية

بعد تأكدك من أن كل شيء يعمل:

1. ✅ قم بفتح الفرونت (React/Vue)
2. ✅ أنشئ component للاتصال بـ Socket.IO
3. ✅ عرّض البيانات على الخريطة
4. ✅ أضف مراقبة الصحة والأخطاء

---

## 📚 المراجع

- [البداية السريعة](./DroneID-Quick-Start-AR.md)
- [الدليل الشامل](./DroneID-Service-AR.md)
- [أحداث Socket.IO](./socket-events.md)
- [المخططات والهندسة](./DroneID-Architecture-Diagrams-AR.md)

---

**تم إضافة DroneID Service بنجاح! 🎉**

البورت: `172.20.20.99:5055` ✅
الأحداث: مرئية في Postman ✅
