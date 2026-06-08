# Socket Events Contract

هذا الملف يشرح عقد الاتصال الخاص بالـ Socket.IO بين الفرونت والباك إند.

لشرح التتبع الداخلي للمشروع خطوة بخطوة، ومسار كل حدث داخل كود الباك، راجع أيضًا الملف:

- `docs/runtime-workflow-deep-ar.md`

## 1) معلومات الاتصال

- البروتوكول: Socket.IO
- السيرفر: `http://HOST:PORT`
- المسار: `SOCKET_PATH` والقيمة الافتراضية هي `/socket.io`
- مثال محلي: `http://localhost:3000` مع path = `/socket.io`

مهم:

- هذا المشروع يستخدم Socket.IO وليس WebSocket خام.
- Postman ممتاز لتوثيق الـ payloads ومراجعة JSON، لكنه ليس الأداة الأدق لاختبار Socket.IO protocol نفسه.
- للاختبار الفعلي يفضل استخدام `socket.io-client` أو صفحة فرونت بسيطة أو أي Socket.IO tester يدعم البروتوكول نفسه.

## 2) ماذا يحدث عند الاتصال

بمجرد نجاح الاتصال، السيرفر يرسل للعميل الحدث التالي:

### `grpc:methods`

هذا الحدث يعطي الفرونت قائمة الطرق المتاحة القادمة من gRPC.

مثال payload:

```json
{
  "methods": [
    {
      "serviceName": "DeviceControl",
      "methodName": "ListDevices",
      "requestEvent": "grpc:invoke:DeviceControl.ListDevices",
      "responseEvent": "DeviceControl.ListDevices",
      "responseStream": false
    },
    {
      "serviceName": "SpectrumStream",
      "methodName": "SubscribeSweep",
      "requestEvent": "grpc:invoke:SpectrumStream.SubscribeSweep",
      "responseEvent": "SpectrumStream.SubscribeSweep",
      "responseStream": true
    },
    {
      "serviceName": "DMRClassifier",
      "methodName": "ClassifyFrequency",
      "requestEvent": "grpc:invoke:DMRClassifier.ClassifyFrequency",
      "responseEvent": "DMRClassifier.ClassifyFrequency",
      "responseStream": false
    },
    {
      "serviceName": "TETRAClassifier",
      "methodName": "ClassifyFrequency",
      "requestEvent": "grpc:invoke:TETRAClassifier.ClassifyFrequency",
      "responseEvent": "TETRAClassifier.ClassifyFrequency",
      "responseStream": false
    },
    {
      "serviceName": "SignalRecorder",
      "methodName": "StartRecording",
      "requestEvent": "grpc:invoke:SignalRecorder.StartRecording",
      "responseEvent": "SignalRecorder.StartRecording",
      "responseStream": false
    },
    {
      "serviceName": "SignalRecorder",
      "methodName": "WatchRecording",
      "requestEvent": "grpc:invoke:SignalRecorder.WatchRecording",
      "responseEvent": "SignalRecorder.WatchRecording",
      "responseStream": true
    },
    {
      "serviceName": "SignalRecorder",
      "methodName": "DownloadRecording",
      "requestEvent": "grpc:invoke:SignalRecorder.DownloadRecording",
      "responseEvent": "SignalRecorder.DownloadRecording",
      "responseStream": true
    }
  ]
}
```

إذا كنت ترى في Postman فقط رسالة اتصال و `socket id` بدون أي event names، فالمشكلة غالبًا ليست في الباك نفسه بل في أداة الاختبار:

- الباك هنا يرسل named events من نوع Socket.IO مثل `grpc:methods` وليس رسائل WebSocket خام.
- كثير من أدوات WebSocket العامة تظهر نجاح الاتصال transport-level فقط، لكنها لا تعرض Socket.IO packets كأحداث تطبيقية بنفس الوضوح.
- لهذا قد ترى `connected` فقط، بينما الحدث `grpc:methods` لا يظهر لك بصيغة مفهومة داخل Postman.

النتيجة العملية:

- اعتبر Postman مناسبًا لتوثيق الـ JSON payloads.
- لا تعتمد عليه وحده للتحقق من events الخاصة بـ Socket.IO.
- للاختبار الفعلي استخدم `socket.io-client` أو واجهة فرونت أو أي tester يدعم Socket.IO protocol نفسه.

## 2.1) التسلسل العملي الصحيح بين الفرونت والباك و gRPC

هذا هو التسلسل الذي يجب أن يحصل ليبدأ عرض الخدمات ثم فتح الجهاز ثم بدء الستريم:

1. الفرونت يتصل مع السيرفر على Socket.IO.
2. الباك يرسل مباشرة `grpc:methods` ليخبر الفرونت ما هي الخدمات والـ methods المتاحة.
3. الفرونت يطلب عرض الأجهزة عبر `grpc:invoke:DeviceControl.ListDevices` أو `grpc:invoke` مع `service=DeviceControl` و `method=ListDevices`.
4. الباك يستدعي gRPC method `DeviceControl.ListDevices`.
5. gRPC يعيد قائمة الأجهزة إلى الباك.
6. الباك يعيد للفرونت حدثين للعميل نفسه:
  - `grpc:result` كتأكيد منظم على نجاح الطلب
  - `DeviceControl.ListDevices` ويحمل البيانات الفعلية
7. الفرونت يختار جهازًا ويرسل `grpc:invoke:DeviceControl.OpenDevice`.
8. الباك يستدعي `DeviceControl.OpenDevice` على gRPC.
9. gRPC يعيد `sessionId` ومعلومات الجلسة.
10. الباك يعيد للفرونت:
  - `grpc:result`
  - `DeviceControl.OpenDevice`
11. بعد حصول الفرونت على `sessionId` يمكنه إرسال أوامر ضبط مثل `SetFrequency` و `SetSampleRate` و `SetGain` و `GetDeviceState`.
12. عندما يريد الفرونت بدء الستريم، يرسل أحد الأحداث التالية حسب نوع البيانات المطلوبة:
  - `grpc:invoke:IQStream.Subscribe`
  - `grpc:invoke:SpectrumStream.SubscribeRTSpectrum`
  - `grpc:invoke:SpectrumStream.SubscribeWaterfall`
  - `grpc:invoke:SpectrumStream.SubscribeSweep`
13. عندما يريد الفرونت التحقق هل تردد معين يحمل DMR أم لا، يرسل `grpc:invoke:DMRClassifier.ClassifyFrequency`.
14. الباك يستدعي `DMRClassifier.ClassifyFrequency` على gRPC ويرجع النتيجة لنفس العميل عبر `grpc:result` وأيضًا عبر `DMRClassifier.ClassifyFrequency`.
15. عندما يريد الفرونت التحقق هل تردد معين يحمل TETRA أم لا، يرسل `grpc:invoke:TETRAClassifier.ClassifyFrequency`.
16. الباك يستدعي `TETRAClassifier.ClassifyFrequency` على gRPC ويرجع النتيجة لنفس العميل عبر `grpc:result` وأيضًا عبر `TETRAClassifier.ClassifyFrequency`.
17. عندما يريد الفرونت بدء تسجيل إشارة أو متابعته أو تنزيل ملف التسجيل، يرسل أحد أحداث `SignalRecorder` مثل `grpc:invoke:SignalRecorder.StartRecording` أو `grpc:invoke:SignalRecorder.WatchRecording` أو `grpc:invoke:SignalRecorder.DownloadRecording`.
18. الباك يستدعي الـ method المقابل على gRPC ويرجع إما نتيجة `unary` مثل `SignalRecorder.StartRecording` أو acknowledgment ثم stream مثل `SignalRecorder.WatchRecording` و `SignalRecorder.DownloadRecording`.
19. الباك يطلب الستريم الموافق من gRPC.
20. الباك يعيد أولًا `grpc:result` كـ acknowledgment بأن الستريم بدأ أو أنه موجود مسبقًا.
21. بعد ذلك تبدأ رسائل الداتا الفعلية بالوصول على event العمل نفسه مثل `IQStream.Subscribe` أو `SpectrumStream.SubscribeRTSpectrum` أو `SignalRecorder.WatchRecording` أو `SignalRecorder.DownloadRecording`.

## 2.2) أقل سيناريو مطلوب ليبدأ النظام بالعمل

إذا كان هدفك فقط تشغيل السيناريو الأساسي، فالتسلسل الأدنى هو:

1. استقبل `grpc:methods`
2. أرسل `grpc:invoke:DeviceControl.ListDevices`
3. خذ `deviceId` من `DeviceControl.ListDevices`
4. أرسل `grpc:invoke:DeviceControl.OpenDevice`
5. خذ `sessionId` من `DeviceControl.OpenDevice`
6. أرسل event الستريم المناسب مع `sessionId`
7. استقبل acknowledgment على `grpc:result`
8. استقبل الداتا المتدفقة على event الستريم نفسه

## 2.3) خريطة الأحداث بين الأطراف

### عرض الخدمات والـ methods

```text
Frontend  -> connects -> Backend Socket.IO
Backend   -> grpc:methods -> Frontend
```

### عرض الأجهزة

```text
Frontend  -> grpc:invoke:DeviceControl.ListDevices -> Backend
Backend   -> DeviceControl.ListDevices (gRPC) -> gRPC server
gRPC      -> ListDevicesResponse -> Backend
Backend   -> grpc:result -> Frontend
Backend   -> DeviceControl.ListDevices -> Frontend
```

### فتح جهاز

```text
Frontend  -> grpc:invoke:DeviceControl.OpenDevice -> Backend
Backend   -> DeviceControl.OpenDevice (gRPC) -> gRPC server
gRPC      -> OpenDeviceResponse(sessionId, ...) -> Backend
Backend   -> grpc:result -> Frontend
Backend   -> DeviceControl.OpenDevice -> Frontend
```

### بدء IQ stream

```text
Frontend  -> grpc:invoke:IQStream.Subscribe -> Backend
Backend   -> IQStream.Subscribe (gRPC stream) -> gRPC server
Backend   -> grpc:result { mode: server-stream } -> Frontend
gRPC      -> IQChunk #1..n -> Backend
Backend   -> IQStream.Subscribe #1..n -> Frontend
```

### بدء Spectrum stream

```text
Frontend  -> grpc:invoke:SpectrumStream.SubscribeRTSpectrum -> Backend
Backend   -> SpectrumStream.SubscribeRTSpectrum (gRPC stream) -> gRPC server
Backend   -> grpc:result { mode: server-stream } -> Frontend
gRPC      -> SpectrumFrame #1..n -> Backend
Backend   -> SpectrumStream.SubscribeRTSpectrum #1..n -> Frontend
```

### فحص تردد DMR

```text
Frontend  -> grpc:invoke:DMRClassifier.ClassifyFrequency -> Backend
Backend   -> DMRClassifier.ClassifyFrequency (gRPC) -> gRPC server
gRPC      -> ClassifyFrequencyResponse -> Backend
Backend   -> grpc:result -> Frontend
Backend   -> DMRClassifier.ClassifyFrequency -> Frontend
```

### فحص تردد TETRA

```text
Frontend  -> grpc:invoke:TETRAClassifier.ClassifyFrequency -> Backend
Backend   -> TETRAClassifier.ClassifyFrequency (gRPC) -> gRPC server
gRPC      -> ClassifyFrequencyResponse -> Backend
Backend   -> grpc:result -> Frontend
Backend   -> TETRAClassifier.ClassifyFrequency -> Frontend
```

### بدء ومتابعة تسجيل إشارة

```text
Frontend  -> grpc:invoke:SignalRecorder.StartRecording -> Backend
Backend   -> SignalRecorder.StartRecording (gRPC) -> gRPC server
gRPC      -> StartRecordingResponse -> Backend
Backend   -> grpc:result -> Frontend
Backend   -> SignalRecorder.StartRecording -> Frontend

Frontend  -> grpc:invoke:SignalRecorder.WatchRecording -> Backend
Backend   -> SignalRecorder.WatchRecording (gRPC stream) -> gRPC server
Backend   -> grpc:result { mode: server-stream } -> Frontend
gRPC      -> RecordingEvent #1..n -> Backend
Backend   -> SignalRecorder.WatchRecording #1..n -> Frontend

Frontend  -> grpc:invoke:SignalRecorder.DownloadRecording -> Backend
Backend   -> SignalRecorder.DownloadRecording (gRPC stream) -> gRPC server
Backend   -> grpc:result { mode: server-stream } -> Frontend
gRPC      -> DownloadRecordingChunk #1..n -> Backend
Backend   -> SignalRecorder.DownloadRecording #1..n -> Frontend
```

## 2.4) ما الذي يجب أن يشترك عليه الفرونت فعليًا

الفرونت يجب أن يراقب على الأقل هذه الأحداث:

- `grpc:methods`
- `grpc:result`
- `grpc:error`
- `DeviceControl.ListDevices`
- `DeviceControl.OpenDevice`
- `DeviceControl.GetDeviceState`
- `DMRClassifier.ClassifyFrequency`
- `TETRAClassifier.ClassifyFrequency`
- `SignalRecorder.StartRecording`
- `SignalRecorder.StopRecording`
- `SignalRecorder.GetRecording`
- `SignalRecorder.ListRecordings`
- `SignalRecorder.DeleteRecording`
- `SignalRecorder.WatchRecording`
- `SignalRecorder.DownloadRecording`
- `IQStream.Subscribe`
- `SpectrumStream.SubscribeRTSpectrum`
- `SpectrumStream.SubscribeWaterfall`
- `SpectrumStream.SubscribeSweep`

إذا لم يضع الفرونت listeners على هذه الأحداث، فحتى لو نجح الاتصال لن يرى شيئًا بعد `connected`.

## 3) الأحداث التي يجب أن يرسلها الفرونت إلى السيرفر

يوجد أسلوبان للإرسال:

### `grpc:invoke`

هذا الحدث العام يمكنه استدعاء أي method.

Payload:

```json
{
  "service": "DeviceControl",
  "method": "ListDevices",
  "payload": {},
  "requestId": "req-001"
}
```

الوصف:

- `service`: اسم الخدمة كما هو ظاهر في `grpc:methods`
- `method`: اسم الـ method
- `payload`: جسم الطلب المرسل إلى gRPC
- `requestId`: اختياري لكنه مهم جدًا لتتبع الردود في الفرونت

مهم جدًا بخصوص أسماء الحقول:

- الباك يستقبل أسماء الحقول بصيغة `camelCase` وليس `snake_case`.
- أي field من نوع `uint64` أو `int64` في الـ proto يظهر هنا عادة كسلسلة نصية `string` وليس كرقم JavaScript عادي.
- مثال صحيح: `deviceId`, `centerFreqHz`, `sampleRateHz`
- مثال صحيح في خدمة DMR: `targetFreqHz`, `captureMs`, `deviceId`, `gainMode`, `gainTenthDb`
- مثال صحيح في خدمة TETRA: `targetFreqHz`, `captureMs`, `deviceId`, `gainMode`, `gainTenthDb`, `earlyExitOnFirstFrame`, `maxFrames`
- مثال صحيح في خدمة SignalRecorder: `targetFreqHz`, `output`, `demod`, `durationMs`, `bandwidthHz`, `deviceId`, `sampleRateHz`, `label`, `gainTenthDb`, `gainManual`
- مثال خاطئ: `device_id`, `center_freq_hz`, `sample_rate_hz`

### `grpc:invoke:Service.Method`

هذا اختصار مباشر لكل method بدل استخدام `grpc:invoke` العام.

مثال:

```json
{
  "payload": {
    "sessionId": "session-123",
    "centerFreqHz": "101700000"
  },
  "requestId": "req-002"
}
```

ويرسل على event اسمه:

```text
grpc:invoke:DeviceControl.SetFrequency
```

ويمكن أيضًا إرسال الـ payload مباشرة بدون wrapper إذا لم يكن `requestId` مهمًا:

```json
{
  "sessionId": "session-123",
  "centerFreqHz": "101700000"
}
```

## 4) الأحداث التي يرجعها السيرفر للعميل مباشرة

### `grpc:result`

يصل للعميل الذي طلب العملية فقط.

في الطلبات unary:

```json
{
  "requestId": "req-001",
  "triggerEvent": "grpc:invoke",
  "service": "DeviceControl",
  "method": "ListDevices",
  "result": {
    "mode": "unary",
    "eventName": "DeviceControl.ListDevices",
    "payload": {
      "devices": []
    }
  }
}
```

في الطلبات streaming:

```json
{
  "requestId": "req-010",
  "triggerEvent": "grpc:invoke:SpectrumStream.SubscribeRTSpectrum",
  "service": "SpectrumStream",
  "method": "SubscribeRTSpectrum",
  "result": {
    "mode": "server-stream",
    "streamKey": "sdr_ingestion.v2.SpectrumStream.SubscribeRTSpectrum:{\"harogic\":{},\"sessionId\":\"session-123\"}",
    "status": "started",
    "eventName": "SpectrumStream.SubscribeRTSpectrum"
  }
}
```

معنى `status`:

- `started`: تم إنشاء stream جديد
- `already-active`: يوجد stream مطابق أصلًا وتم ربط العميل عليه

### `grpc:error`

يصل للعميل الطالب فقط عند الخطأ.

مثال:

```json
{
  "requestId": "req-003",
  "triggerEvent": "grpc:invoke:DeviceControl.SetFrequency",
  "service": "DeviceControl",
  "method": "SetFrequency",
  "statusCode": 400,
  "message": "Validation failed for sdr_ingestion.v2.SetFrequencyRequest"
}
```

## 5) الأحداث التي يرسلها السيرفر للفرونت كبيانات عمل فعلية

هذه هي الأحداث المهمة التي يجب على الفرونت الاشتراك بها لاستقبال الداتا الفعلية.

### ملاحظة مهمة جدًا

- إذا كان الاستدعاء Unary، فالعميل الطالب يستقبل نتيجته على حدث business نفسه أيضًا.
- إذا كان الاستدعاء Streaming من نفس العميل، فالعميل الطالب فقط يستقبل بيانات هذا stream.
- إذا كان هناك stream auto-start من إعدادات السيرفر (`GRPC_STREAM_SUBSCRIPTIONS`) فسيتم بثه لجميع العملاء المتصلين.

### DMRClassifier Events

#### `DMRClassifier.ClassifyFrequency`

هذا الاستدعاء `unary` وليس stream.

Request payload:

```json
{
  "targetFreqHz": "438500000",
  "captureMs": 1200,
  "deviceId": "rtlsdr:0",
  "gainMode": "GAIN_MODE_AUTO"
}
```

مثال آخر عند استخدام gain يدوي:

```json
{
  "targetFreqHz": "438500000",
  "captureMs": 1500,
  "deviceId": "rtlsdr:0",
  "gainMode": "GAIN_MODE_MANUAL",
  "gainTenthDb": 287
}
```

ملاحظات مهمة:

- `targetFreqHz` من نوع `uint64` لذلك يجب إرساله كسلسلة نصية `string`.
- أسماء الحقول يجب أن تكون `camelCase` كما في المثال، وليس `target_freq_hz` أو `gain_tenth_db`.
- نتيجة الفحص ستصل على `grpc:result` وعلى event العمل نفسه `DMRClassifier.ClassifyFrequency`.

Response payload:

```json
{
  "verdict": "VERDICT_DMR",
  "isDmr": true,
  "confidence": 0.94,
  "evidence": {
    "syncWordsFound": 3,
    "bestSyncHammingErrors": 0,
    "totalSyncHammingErrors": 2,
    "cfoHzUsed": -41.5,
    "effectiveFsHz": 48000,
    "samplesPerSymbol": 10,
    "matchedSyncTypes": ["BS_VOICE"],
    "bandwidth_3dbKhz": 11.2,
    "inChannelPowerDbfs": -24.8,
    "snrDbEstimate": 18.4
  },
  "capturedFreqHz": "438500000",
  "capturedSampleRateHz": 240000,
  "capturedMs": 1200,
  "capturedSamples": "288000",
  "deviceIdUsed": "rtlsdr:0",
  "gainModeUsed": "GAIN_MODE_AUTO",
  "gainTenthDbUsed": 0
}
```

### TETRAClassifier Events

#### `TETRAClassifier.ClassifyFrequency`

هذا الاستدعاء `unary` وليس stream.

الحدث الذي يرسله الفرونت إلى الباك:

```text
grpc:invoke:TETRAClassifier.ClassifyFrequency
```

الاستدعاء الذي يرسله الباك إلى gRPC:

```text
TETRAClassifier.ClassifyFrequency
```

Request payload:

```json
{
  "targetFreqHz": "438500000",
  "captureMs": 1500,
  "deviceId": "rtlsdr:2",
  "gainMode": "GAIN_MODE_AUTO",
  "earlyExitOnFirstFrame": true,
  "maxFrames": 50
}
```

مثال مع gain يدوي:

```json
{
  "targetFreqHz": "438500000",
  "captureMs": 1800,
  "deviceId": "rtlsdr:2",
  "gainMode": "GAIN_MODE_MANUAL",
  "gainTenthDb": 287,
  "earlyExitOnFirstFrame": false,
  "maxFrames": 200
}
```

ملاحظات مهمة:

- `targetFreqHz` من نوع `uint64` لذلك يجب إرساله كسلسلة نصية `string`.
- الحد الأدنى العملي لـ `captureMs` هنا هو `800` وفق البروتو.
- أسماء الحقول يجب أن تكون `camelCase` مثل `earlyExitOnFirstFrame` و `maxFrames` وليس `early_exit_on_first_frame` أو `max_frames`.
- نتيجة الفحص ستصل على `grpc:result` وعلى event العمل نفسه `TETRAClassifier.ClassifyFrequency`.

Response payload:

```json
{
  "verdict": "VERDICT_TETRA",
  "isTetra": true,
  "confidence": 0.91,
  "evidence": {
    "framesObserved": 14,
    "bschFrames": 2,
    "sysinfoFrames": 4,
    "tchSFrames": 3,
    "cmceFrames": 1,
    "distinctCalls": 2,
    "mcc": 425,
    "mnc": 1,
    "locationArea": 77,
    "colourCode": 12,
    "advertisedFreqHz": "438500000",
    "timeToFirstFrameMs": 934,
    "anyCallUnencrypted": true
  },
  "capturedFreqHz": "438500000",
  "capturedSampleRateHz": 1800000,
  "capturedMs": 1500,
  "effectiveCaptureMs": 1200,
  "deviceIdUsed": "rtlsdr:2",
  "gainModeUsed": "GAIN_MODE_AUTO",
  "gainTenthDbUsed": 0,
  "frames": [
    "{\"type\":\"BSCH\",\"mcc\":425}",
    "{\"type\":\"SYSINFO\",\"mnc\":1}"
  ],
  "framesTruncated": false
}
```

قد يتأخر هذا الاستدعاء عدة ثوانٍ لأن الخدمة تنتظر التقاط وتحليل الإطارات قبل الرد، لذلك تم رفع المهلة الخاصة به في الباك.

### SignalRecorder Events

#### `SignalRecorder.StartRecording`

هذا الاستدعاء `unary`.

الحدث الذي يرسله الفرونت إلى الباك:

```text
grpc:invoke:SignalRecorder.StartRecording
```

الاستدعاء الذي يرسله الباك إلى gRPC:

```text
SignalRecorder.StartRecording
```

Request payload:

```json
{
  "targetFreqHz": "101700000",
  "output": "OUTPUT_FORMAT_WAV",
  "demod": "DEMOD_MODE_WBFM",
  "durationMs": 10000,
  "bandwidthHz": 180000,
  "deviceId": "rtlsdr:2",
  "sampleRateHz": 2048000,
  "label": "fm-sample",
  "gainTenthDb": 287,
  "gainManual": false
}
```

Response payload:

```json
{
  "recordingId": "rec-001",
  "state": "RECORDING_STATE_STARTING",
  "estimatedSizeBytes": "5242880",
  "artifactPath": "/recordings/rec-001.wav"
}
```

#### `SignalRecorder.StopRecording`

هذا الاستدعاء `unary`.

الحدث الذي يرسله الفرونت إلى الباك:

```text
grpc:invoke:SignalRecorder.StopRecording
```

الاستدعاء الذي يرسله الباك إلى gRPC:

```text
SignalRecorder.StopRecording
```

Request payload:

```json
{
  "recordingId": "rec-001"
}
```

Response payload:

```json
{
  "state": "RECORDING_STATE_STOPPED"
}
```

#### `SignalRecorder.GetRecording`

هذا الاستدعاء `unary`.

الحدث الذي يرسله الفرونت إلى الباك:

```text
grpc:invoke:SignalRecorder.GetRecording
```

الاستدعاء الذي يرسله الباك إلى gRPC:

```text
SignalRecorder.GetRecording
```

Request payload:

```json
{
  "recordingId": "rec-001"
}
```

Response payload:

```json
{
  "info": {
    "recordingId": "rec-001",
    "state": "RECORDING_STATE_COMPLETED",
    "artifactPath": "/recordings/rec-001.wav",
    "fileSizeBytes": "5239901",
    "sha256Hex": "abcdef123456",
    "targetFreqHz": "101700000",
    "sampleRateHz": 2048000,
    "output": "OUTPUT_FORMAT_WAV",
    "demod": "DEMOD_MODE_WBFM",
    "bandwidthHz": 180000,
    "durationRequestedMs": 10000,
    "durationActualMs": 9984,
    "startedAtNs": "1717240000000000000",
    "endedAtNs": "1717240010000000000",
    "deviceIdUsed": "rtlsdr:2",
    "label": "fm-sample",
    "gapObserved": false,
    "audioSampleRateHz": 48000
  }
}
```

#### `SignalRecorder.ListRecordings`

هذا الاستدعاء `unary`.

الحدث الذي يرسله الفرونت إلى الباك:

```text
grpc:invoke:SignalRecorder.ListRecordings
```

الاستدعاء الذي يرسله الباك إلى gRPC:

```text
SignalRecorder.ListRecordings
```

Request payload:

```json
{
  "stateFilter": "RECORDING_STATE_COMPLETED",
  "pageSize": 20,
  "pageCursor": ""
}
```

يمكن أيضاً إرسال `{}` للحصول على القائمة الافتراضية.

Response payload:

```json
{
  "recordings": [],
  "nextPageCursor": ""
}
```

#### `SignalRecorder.DeleteRecording`

هذا الاستدعاء `unary`.

الحدث الذي يرسله الفرونت إلى الباك:

```text
grpc:invoke:SignalRecorder.DeleteRecording
```

الاستدعاء الذي يرسله الباك إلى gRPC:

```text
SignalRecorder.DeleteRecording
```

Request payload:

```json
{
  "recordingId": "rec-001",
  "stopIfRunning": true
}
```

Response payload:

```json
{
  "deleted": true
}
```

#### `SignalRecorder.WatchRecording`

هذا الاستدعاء `stream` طويل الأمد.

الحدث الذي يرسله الفرونت إلى الباك:

```text
grpc:invoke:SignalRecorder.WatchRecording
```

الاستدعاء الذي يرسله الباك إلى gRPC:

```text
SignalRecorder.WatchRecording
```

Request payload:

```json
{
  "recordingId": "rec-001"
}
```

أول رد يصل على `grpc:result` كـ acknowledgment بأن stream بدأ أو أنه موجود مسبقاً.

Stream message payload:

```json
{
  "sequence": "1",
  "timestampNs": "1717240000000000000",
  "state": "RECORDING_STATE_RECORDING",
  "samplesWritten": "4096",
  "bytesWritten": "8192",
  "elapsedMs": 250,
  "gapObserved": false,
  "failureReason": ""
}
```

ملاحظات مهمة:

- الحقول `uint64` و `int64` مثل `sequence` و `timestampNs` و `samplesWritten` و `bytesWritten` ستظهر كسلاسل نصية `string`.
- أوامر `StartRecording` و`StopRecording` و`GetRecording` و`ListRecordings` و`DeleteRecording` هي unary، أما `WatchRecording` و`DownloadRecording` فهما server-stream.

#### `SignalRecorder.DownloadRecording`

هذا الاستدعاء `stream` طويل الأمد مخصص لتنزيل ملف التسجيل على شكل chunks.

الحدث الذي يرسله الفرونت إلى الباك:

```text
grpc:invoke:SignalRecorder.DownloadRecording
```

الاستدعاء الذي يرسله الباك إلى gRPC:

```text
SignalRecorder.DownloadRecording
```

Request payload:

```json
{
  "recordingId": "rec-001",
  "chunkSizeBytes": 65536
}
```

أول رد يصل على `grpc:result` كـ acknowledgment بأن stream بدأت أو أنها موجودة مسبقاً.

أول chunk عملي على `SignalRecorder.DownloadRecording` يكون عادة metadata:

```json
{
  "metadata": {
    "filename": "rec-001.wav",
    "totalSizeBytes": "10485760",
    "sha256Hex": "4d5e6f...",
    "output": "OUTPUT_FORMAT_WAV"
  }
}
```

ثم تصل chunks البيانات اللاحقة على نفس event:

```json
{
  "data": "<base64-or-binary-string>"
}
```

ملاحظات مهمة:

- الحقل `totalSizeBytes` من نوع `uint64` وسيظهر كسلسلة نصية `string`.
- الحقل `data` قادم من `bytes` وسيظهر في البوابة الحالية كسلسلة نصية.
- أول message في الستريم تحمل `metadata`، والرسائل التالية تحمل `data`.

### DeviceControl Events

#### `DeviceControl.ListDevices`

Request payload:

```json
{}
```

Response payload:

```json
{
  "devices": [
    {
      "deviceId": "rtl-0",
      "kind": "DEVICE_KIND_RTLSDR",
      "serial": "00000001",
      "name": "RTL-SDR USB",
      "index": 0,
      "supportedSampleRatesHz": [1024000, 2048000],
      "minFreqHz": "24000000",
      "maxFreqHz": "1766000000",
      "supportedGainsTenthDb": [0, 77, 125]
    }
  ]
}
```

#### `DeviceControl.OpenDevice`

Request payload:

```json
{
  "deviceId": "rtl-0",
  "centerFreqHz": "100000000",
  "sampleRateHz": 2048000,
  "gainMode": "GAIN_MODE_MANUAL",
  "gainTenthDb": 200,
  "freqCorrectionPpm": 0,
  "harogic": {}
}
```

مثال شائع خاطئ يسبب فشل الطلب:

```json
{
  "device_id": "rtlsdr:2",
  "center_freq_hz": 24000000,
  "sample_rate_hz": 1000000
}
```

السبب:

- أسماء الحقول هنا `snake_case` بينما الباك يتوقع `camelCase`
- `centerFreqHz` متوقع كسلسلة نصية `string` وليس رقمًا مباشرًا

الصيغة الصحيحة لنفس الطلب:

```json
{
  "deviceId": "rtlsdr:2",
  "centerFreqHz": "24000000",
  "sampleRateHz": 1000000
}
```

Response payload:

```json
{
  "sessionId": "session-123",
  "device": {
    "deviceId": "rtl-0"
  },
  "sampleFormat": "SAMPLE_FORMAT_INT16_IQ",
  "actualSampleRateHz": 2048000
}
```

#### `DeviceControl.CloseDevice`

Request payload:

```json
{
  "sessionId": "session-123"
}
```

Response payload:

```json
{}
```

#### `DeviceControl.SetFrequency`

Request payload:

```json
{
  "sessionId": "session-123",
  "centerFreqHz": "101700000"
}
```

Response payload:

```json
{
  "actualFreqHz": "101700000"
}
```

#### `DeviceControl.SetSampleRate`

Request payload:

```json
{
  "sessionId": "session-123",
  "sampleRateHz": 2048000
}
```

Response payload:

```json
{
  "actualSampleRateHz": 2048000
}
```

#### `DeviceControl.SetGain`

Request payload:

```json
{
  "sessionId": "session-123",
  "gainMode": "GAIN_MODE_MANUAL",
  "gainTenthDb": 150
}
```

Response payload:

```json
{
  "actualGainTenthDb": 150
}
```

#### `DeviceControl.SetFrequencyCorrection`

Request payload:

```json
{
  "sessionId": "session-123",
  "ppm": 1
}
```

Response payload:

```json
{
  "actualPpm": 1
}
```

#### `DeviceControl.GetDeviceState`

Request payload:

```json
{
  "sessionId": "session-123"
}
```

Response payload مختصر:

```json
{
  "centerFreqHz": "101700000",
  "sampleRateHz": 2048000,
  "gainMode": "GAIN_MODE_MANUAL",
  "gainTenthDb": 150,
  "freqCorrectionPpm": 1,
  "subscribers": 2,
  "supportedGainsTenthDb": [0, 77, 125, 150],
  "currentCaptureMode": "CAPTURE_MODE_RTA_SPECTRUM"
}
```

#### `DeviceControl.SetHarogicConfig`

Request payload:

```json
{
  "sessionId": "session-123",
  "config": {
    "tracePoints": 2048,
    "rbwMode": "HAROGIC_RBW_AUTO",
    "vbwMode": "HAROGIC_VBW_EQUAL_TO_RBW"
  }
}
```

Response payload:

```json
{
  "effective": {
    "tracePoints": 2048,
    "rbwMode": "HAROGIC_RBW_AUTO",
    "vbwMode": "HAROGIC_VBW_EQUAL_TO_RBW"
  }
}
```

#### `DeviceControl.ListSessions`

Request payload:

```json
{}
```

Response payload:

```json
{
  "sessions": [
    {
      "sessionId": "session-123",
      "deviceId": "rtl-0",
      "deviceKind": "DEVICE_KIND_RTLSDR",
      "captureMode": "CAPTURE_MODE_IQS",
      "startedAtUnixNs": "1717240000000000000"
    }
  ]
}
```

### IQStream Events

#### `IQStream.Subscribe`

هذا stream طويل الأمد.

Request payload:

```json
{
  "sessionId": "session-123",
  "chunkSizeSamples": 4096,
  "dcRemovalEnabled": true,
  "iqBalanceEnabled": true,
  "outputFormat": "SAMPLE_FORMAT_INT16_IQ"
}
```

Stream message payload:

```json
{
  "sequence": "1",
  "timestampNs": "1717240000000000000",
  "centerFreqHz": "101700000",
  "sampleRateHz": 2048000,
  "format": "SAMPLE_FORMAT_INT16_IQ",
  "samples": "BASE64_OR_ENCODED_DATA",
  "gapBefore": false,
  "droppedChunksBefore": 0,
  "droppedSamplesBefore": "0"
}
```

### SpectrumStream Events

#### `SpectrumStream.SubscribeRTSpectrum`

Request payload:

```json
{
  "sessionId": "session-123",
  "harogic": {
    "tracePoints": 2048
  }
}
```

Stream message payload:

```json
{
  "sequence": "15",
  "timestampNs": "1717240000000000000",
  "centerFreqHz": "101700000",
  "sampleRateHz": 2048000,
  "startFreqHz": "100676000",
  "binStepHz": "1000",
  "binCount": 2048,
  "powersDbm": "BASE64_OR_ENCODED_DATA",
  "gapBefore": false,
  "droppedFramesBefore": 0
}
```

#### `SpectrumStream.SubscribeWaterfall`

Request payload:

```json
{
  "sessionId": "session-123",
  "harogic": {
    "rtaFramesPerTile": 32
  }
}
```

Stream message payload:

```json
{
  "sequence": "4",
  "timestampNs": "1717240000000000000",
  "centerFreqHz": "101700000",
  "startFreqHz": "100676000",
  "binStepHz": "1000",
  "binCount": 2048,
  "frameCount": 32,
  "powersDbm": "BASE64_OR_ENCODED_DATA",
  "perFrameTimestampsNs": "BASE64_OR_ENCODED_DATA",
  "gapBefore": false,
  "droppedTilesBefore": 0
}
```

#### `SpectrumStream.SubscribeSweep`

Request payload:

```json
{
  "sessionId": "session-123",
  "startFreqHz": "88000000",
  "stopFreqHz": "108000000",
  "harogic": {
    "tracePoints": 4096,
    "swtMode": "HAROGIC_SWT_MIN"
  }
}
```

Stream message payload:

```json
{
  "sequence": "7",
  "timestampNs": "1717240000000000000",
  "sweepEndNs": "1717240000005000000",
  "startFreqHz": "88000000",
  "stopFreqHz": "108000000",
  "binStepHz": "5000",
  "binCount": 4096,
  "powersDbm": "BASE64_OR_ENCODED_DATA",
  "gapBefore": false,
  "droppedSweepsBefore": 0
}
```

## 6) قائمة events النهائية المختصرة

قبل القائمة، هذا التوضيح مهم جدًا:

- اسم الـ event ليس هو الـ payload.
- في Socket.IO يوجد دائمًا شيئان منفصلان:
  - `event name`: اسم الحدث نفسه
  - `payload`: البيانات التي تُرسل داخل هذا الحدث
- لذلك عندما نقول `grpc:invoke:DeviceControl.OpenDevice` فنحن نقصد اسم الحدث الذي سيرسله الفرونت.
- وعندما نقول `DeviceControl.OpenDevice` فنحن نقصد اسم الحدث الذي يجب على الفرونت أن يستمع عليه ليستقبل الرد الفعلي.

### كيف تفهم القائمة عمليًا

### من الفرونت إلى الباك

هذه ليست events للاستماع.

هذه events يجب أن يقوم الفرونت بإرسالها `emit` إلى الباك.

أي أن الفرونت يختار اسم event من هذه القائمة، ثم يرسل معه payload مناسب.

مثال:

- event name: `grpc:invoke:DeviceControl.OpenDevice`
- payload:

```json
{
  "deviceId": "rtlsdr:2",
  "centerFreqHz": "24000000",
  "sampleRateHz": 1000000
}
```

أو مع `requestId`:

```json
{
  "payload": {
    "deviceId": "rtlsdr:2",
    "centerFreqHz": "24000000",
    "sampleRateHz": 1000000
  },
  "requestId": "open-001"
}
```

### من الباك إلى الفرونت

هذه ليست events يجب أن يرسلها الفرونت.

هذه events يجب على الفرونت أن يضع لها listeners أو subscriptions ليستقبل ما يرسله الباك.

يعني عمليًا:

- لا ترسل `DeviceControl.OpenDevice` من Postman أو من الفرونت إلى الباك
- بل تستمع لهذا الحدث لكي تستقبل نتيجة فتح الجهاز

مثال منطقي:

- الفرونت يرسل: `grpc:invoke:DeviceControl.OpenDevice`
- الباك يرد على: `grpc:result`
- ثم يرسل أيضًا: `DeviceControl.OpenDevice`

## 6.1) كيف تطبق هذا الكلام في Postman أو أي tester

### إذا كانت الأداة تدعم Socket.IO events فعليًا

عندها ستتعامل مع كل عملية بهذا الشكل:

1. تحدد اسم event الذي تريد إرساله
2. تضع الـ JSON payload الخاص به
3. تراقب events الراجعة من الباك

مثال `OpenDevice`:

1. ترسل event اسمه `grpc:invoke:DeviceControl.OpenDevice`
2. وتضع في message/payload:

```json
{
  "payload": {
    "deviceId": "rtlsdr:2",
    "centerFreqHz": "24000000",
    "sampleRateHz": 1000000
  },
  "requestId": "open-001"
}
```

3. ثم يجب أن تراقب على الأقل:
   - `grpc:result`
   - `grpc:error`
   - `DeviceControl.OpenDevice`

### إذا كانت الأداة لا تدعم Socket.IO named events جيدًا مثل كثير من اختبارات WebSocket العامة

عندها قد تتمكن من الاتصال فقط، لكن لن تتمكن من رؤية أو إدارة events التطبيقية بالشكل الصحيح.

في هذه الحالة:

- نعم تستطيع فهم أسماء events من ملف التوثيق
- لكن لا تعتمد على الأداة لتؤكد لك أن كل event وصل أو خرج فعليًا
- الأفضل هنا استخدام `socket.io-client` أو الفرونت نفسه

## 6.2) الجواب المباشر على سؤالك

### هل events الموجودة تحت `من الباك إلى الفرونت` يجب أن أصنعها أنا في Postman؟

لا.

هذه events لا تقوم أنت بإنشائها أو إرسالها إلى الباك.

هذه events يرسلها الباك تلقائيًا، وأنت فقط يجب أن تكون مستمعًا لها إذا كانت أداة الاختبار تدعم ذلك.

مثال:

- `grpc:methods` يرسله الباك عند الاتصال
- `grpc:result` يرسله الباك بعد نجاح الطلب
- `grpc:error` يرسله الباك عند الخطأ
- `SpectrumStream.SubscribeSweep` يرسله الباك عندما تبدأ بيانات الستريم بالوصول

### هل events الموجودة تحت `من الفرونت إلى الباك` يجب أن أضعها في قسم message في Postman؟

ليس تمامًا.

الذي تضعه في قسم message هو الـ payload فقط.

أما اسم الحدث نفسه فيجب أن يكون محددًا كـ event name في الأداة إن كانت تدعم Socket.IO events.

يعني:

- event name: `grpc:invoke:SpectrumStream.SubscribeSweep`
- message/payload:

```json
{
  "payload": {
    "sessionId": "ad58a052bc6e48b5ada3158d01ac78a4",
    "startFreqHz": "88000000",
    "stopFreqHz": "108000000",
    "harogic": {
      "tracePoints": 4096,
      "swtMode": "HAROGIC_SWT_MIN"
    }
  },
  "requestId": "sweep-001"
}
```

أو إذا كانت الأداة تسمح فقط بإرسال payload مباشر لنفس الحدث:

```json
{
  "sessionId": "ad58a052bc6e48b5ada3158d01ac78a4",
  "startFreqHz": "88000000",
  "stopFreqHz": "108000000",
  "harogic": {
    "tracePoints": 4096,
    "swtMode": "HAROGIC_SWT_MIN"
  }
}
```

## 6.3) قاعدة مختصرة جدًا

- تحت `من الفرونت إلى الباك` = أسماء events التي تعمل لها `emit`
- تحت `من الباك إلى الفرونت` = أسماء events التي تعمل لها `on` أو listener

### من الفرونت إلى الباك

- `grpc:invoke`
- `grpc:invoke:DMRClassifier.ClassifyFrequency`
- `grpc:invoke:TETRAClassifier.ClassifyFrequency`
- `grpc:invoke:SignalRecorder.StartRecording`
- `grpc:invoke:SignalRecorder.StopRecording`
- `grpc:invoke:SignalRecorder.GetRecording`
- `grpc:invoke:SignalRecorder.ListRecordings`
- `grpc:invoke:SignalRecorder.DeleteRecording`
- `grpc:invoke:SignalRecorder.WatchRecording`
- `grpc:invoke:SignalRecorder.DownloadRecording`
- `grpc:invoke:DeviceControl.ListDevices`
- `grpc:invoke:DeviceControl.OpenDevice`
- `grpc:invoke:DeviceControl.CloseDevice`
- `grpc:invoke:DeviceControl.SetFrequency`
- `grpc:invoke:DeviceControl.SetSampleRate`
- `grpc:invoke:DeviceControl.SetGain`
- `grpc:invoke:DeviceControl.SetFrequencyCorrection`
- `grpc:invoke:DeviceControl.GetDeviceState`
- `grpc:invoke:DeviceControl.SetHarogicConfig`
- `grpc:invoke:DeviceControl.ListSessions`
- `grpc:invoke:IQStream.Subscribe`
- `grpc:invoke:SpectrumStream.SubscribeRTSpectrum`
- `grpc:invoke:SpectrumStream.SubscribeWaterfall`
- `grpc:invoke:SpectrumStream.SubscribeSweep`

### من الباك إلى الفرونت

- `grpc:methods`
- `grpc:result`
- `grpc:error`
- `DMRClassifier.ClassifyFrequency`
- `TETRAClassifier.ClassifyFrequency`
- `SignalRecorder.StartRecording`
- `SignalRecorder.StopRecording`
- `SignalRecorder.GetRecording`
- `SignalRecorder.ListRecordings`
- `SignalRecorder.DeleteRecording`
- `SignalRecorder.WatchRecording`
- `SignalRecorder.DownloadRecording`
- `DeviceControl.ListDevices`
- `DeviceControl.OpenDevice`
- `DeviceControl.CloseDevice`
- `DeviceControl.SetFrequency`
- `DeviceControl.SetSampleRate`
- `DeviceControl.SetGain`
- `DeviceControl.SetFrequencyCorrection`
- `DeviceControl.GetDeviceState`
- `DeviceControl.SetHarogicConfig`
- `DeviceControl.ListSessions`
- `IQStream.Subscribe`
- `SpectrumStream.SubscribeRTSpectrum`
- `SpectrumStream.SubscribeWaterfall`
- `SpectrumStream.SubscribeSweep`

## 7) ملاحظات تنفيذية للفرونت

- استخدم `requestId` دائمًا في كل طلب صادر من الفرونت.
- انتظر `grpc:result` أو `grpc:error` لتأكيد نجاح الاستدعاء أو فشله.
- بالنسبة للـ stream، اعتبر `grpc:result` مجرد acknowledgment، والبيانات الفعلية ستصل على event العمل نفسه مثل `IQStream.Subscribe`.
- عند إعادة الاتصال من الفرونت، أعد تسجيل الاشتراكات streaming المطلوبة.
- إذا انقطع السوكت، فالسيرفر ينظف الاشتراكات الخاصة بذلك العميل تلقائيًا.
- في الاستدعاءات unary مثل `DeviceControl.OpenDevice` ستجد `sessionId` إما داخل `grpc:result.result.payload.sessionId` أو داخل `DeviceControl.OpenDevice.sessionId`.
- إذا لم يصل أي رد نهائي من gRPC خلال المهلة، سيصلك `grpc:error` بحالة `504` بدل أن يبقى الطلب معلّقًا بدون نتيجة.

## 8) ملاحظات أداء

- الطلبات القادمة من عميل socket معين لم تعد تُبث لكل العملاء.
- الاستجابات unary تُعاد فقط للعميل صاحب الطلب.
- الـ streams التي يشغلها عميل معين تُدفع فقط لهذا العميل أو لمن يشارك نفس الاشتراك الفعلي.
- فقط الـ startup streams المعرفة في `GRPC_STREAM_SUBSCRIPTIONS` يمكن أن تُبث لجميع العملاء.