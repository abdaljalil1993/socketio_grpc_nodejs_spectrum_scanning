# Workflow Example Sweep

## الهدف
هذا الملف يشرح التنفيذ الحقيقي خطوة بخطوة عند استدعاء:
1. OpenDevice
2. SubscribeSweep

الشرح يغطي التنفيذ داخل هذا المشروع فقط، مع أسماء الملفات وروابط الأسطر الفعلية.

## قبل أي Request: كيف السيرفر يجهز خط التنفيذ
1. عند الإقلاع، السيرفر يجمع ملفات proto في [src/server.ts](src/server.ts#L17) عبر [src/grpc/loader.ts](src/grpc/loader.ts#L23).
2. ثم يحمل gRPC object في [src/server.ts](src/server.ts#L18) عبر [src/grpc/loader.ts](src/grpc/loader.ts#L37).
3. إعداد proto-loader يحدد bytes ك String في [src/grpc/loader.ts](src/grpc/loader.ts#L41). هذا السبب الأصلي لتحويل bytes إلى base64 داخل Node.
4. السيرفر ينشئ gRPC clients في [src/server.ts](src/server.ts#L19) عبر [src/grpc/clients.ts](src/grpc/clients.ts#L123).
5. الربط بين service/method وeventName يأتي من registry في [src/grpc/clients.ts](src/grpc/clients.ts#L133).
6. ينشئ gateway في [src/server.ts](src/server.ts#L27) عبر [src/grpc/handlers.ts](src/grpc/handlers.ts#L213).
7. ينشئ Express app في [src/server.ts](src/server.ts#L33) ويضيف API router في [src/app.ts](src/app.ts#L34).
8. ينشئ Socket.IO server في [src/server.ts](src/server.ts#L35) عبر [src/socket/index.ts](src/socket/index.ts#L47).

---

## Workflow A: OpenDevice عبر Postman (REST)

### Request الذي تكتبه في Postman
POST /invoke/DeviceControl/OpenDevice

Body مثال:
```json
{
  "deviceId": "rtl-0001",
  "centerFreqHz": "433920000",
  "sampleRateHz": 2400000,
  "gainMode": "GAIN_MODE_MANUAL",
  "gainTenthDb": 200,
  "freqCorrectionPpm": 0
}
```

### التنفيذ سطر-بسطر
1. المسار REST يتطابق مع route في [src/api/routes.ts](src/api/routes.ts#L13).
2. الراوتر نفسه منشأ في [src/api/routes.ts](src/api/routes.ts#L6) ويستخدم controller في [src/api/routes.ts](src/api/routes.ts#L7).
3. controller.invoke يقرأ service من [src/api/controller.ts](src/api/controller.ts#L17).
4. يقرأ method من [src/api/controller.ts](src/api/controller.ts#L18).
5. ينفذ الاستدعاء الفعلي إلى gateway عبر [src/api/controller.ts](src/api/controller.ts#L24).
6. داخل gateway يبدأ resolve للمسار في [src/grpc/handlers.ts](src/grpc/handlers.ts#L523).
7. resolveMethod يجيب service من map عبر [src/grpc/handlers.ts](src/grpc/handlers.ts#L230).
8. ثم يجيب method عبر [src/grpc/handlers.ts](src/grpc/handlers.ts#L236).
9. التحقق إن الطريقة unary يتم في [src/grpc/handlers.ts](src/grpc/handlers.ts#L525).
10. payload يتحقق عبر schemaRegistry في [src/grpc/handlers.ts](src/grpc/handlers.ts#L143) وsafeParse في [src/grpc/handlers.ts](src/grpc/handlers.ts#L150).
11. schema المستخدم لـ OpenDeviceRequest مسجل في [src/schemas/generated/index.ts](src/schemas/generated/index.ts#L1014) وتعريفه في [src/schemas/generated/index.ts](src/schemas/generated/index.ts#L595).
12. تنفيذ gRPC unary call يتم هنا: [src/grpc/handlers.ts](src/grpc/handlers.ts#L547).
13. اسم method الفعلي على client كان محسوم وقت البناء في [src/grpc/clients.ts](src/grpc/clients.ts#L154) باستخدام resolver في [src/grpc/clients.ts](src/grpc/clients.ts#L52).
14. بعد رجوع الرد، gateway يعالج/يبث النتيجة عبر [src/grpc/handlers.ts](src/grpc/handlers.ts#L573).
15. النتيجة النهائية ترجع لرد HTTP في [src/api/controller.ts](src/api/controller.ts#L25).
16. eventName المقابل لـ OpenDevice معرف في registry: [src/grpc/registry.ts](src/grpc/registry.ts#L178).
17. حقل session_id الذي تحتاجه للخطوة التالية موجود في proto response: [src/proto/sdr.proto](src/proto/sdr.proto#L284).

### ملاحظة حدود هذا المشروع
إنشاء session فعلياً داخل الهاردوير/خدمة SDR backend الخارجية يحدث بعد gRPC call في [src/grpc/handlers.ts](src/grpc/handlers.ts#L547)، لكنه خارج هذا الريبو، لذلك لا يمكن إعطاء أسطره الداخلية من هنا.

---

## Workflow B: SubscribeSweep عبر Postman (REST)

### Request الذي تكتبه في Postman
POST /invoke/SpectrumStream/SubscribeSweep

Body مثال:
```json
{
  "sessionId": "ضع-session-id-الراجع-من-OpenDevice",
  "startFreqHz": "100000000",
  "stopFreqHz": "200000000"
}
```

### التنفيذ سطر-بسطر
1. نفس route REST يدخل من [src/api/routes.ts](src/api/routes.ts#L13).
2. service/method تنقرأ في [src/api/controller.ts](src/api/controller.ts#L17) و[src/api/controller.ts](src/api/controller.ts#L18).
3. gateway.invoke ينادى من [src/api/controller.ts](src/api/controller.ts#L24).
4. resolve للمسار يتم في [src/grpc/handlers.ts](src/grpc/handlers.ts#L523) ثم [src/grpc/handlers.ts](src/grpc/handlers.ts#L230) و[src/grpc/handlers.ts](src/grpc/handlers.ts#L236).
5. التحقق أن الطريقة server-stream يحصل في [src/grpc/handlers.ts](src/grpc/handlers.ts#L585).
6. بدء الاشتراك الفعلي يتم عبر [src/grpc/handlers.ts](src/grpc/handlers.ts#L586) داخل startServerStream في [src/grpc/handlers.ts](src/grpc/handlers.ts#L390).
7. تنفيذ gRPC stream call نفسه في [src/grpc/handlers.ts](src/grpc/handlers.ts#L414).
8. اسم event المقابل لهذه الطريقة معرف في registry: [src/grpc/registry.ts](src/grpc/registry.ts#L300).
9. eventName موجود أيضاً ضمن قائمة الأحداث العامة في [src/grpc/registry.ts](src/grpc/registry.ts#L416).
10. عند وصول كل رسالة SweepTrace من gRPC، callback data ينفذ في [src/grpc/handlers.ts](src/grpc/handlers.ts#L438).
11. الرسالة تمر إلى emitValidatedMessage في [src/grpc/handlers.ts](src/grpc/handlers.ts#L445).
12. قبل الإرسال، normalizeResponsePayload ينفذ في [src/grpc/handlers.ts](src/grpc/handlers.ts#L345) ودالته في [src/grpc/handlers.ts](src/grpc/handlers.ts#L245).
13. تحويل powersDbm إلى binary Buffer (بدل base64) يتم في [src/grpc/handlers.ts](src/grpc/handlers.ts#L252) باستخدام helper [src/grpc/handlers.ts](src/grpc/handlers.ts#L126).
14. بعد ذلك validation للرد يتم عبر safeParse في [src/grpc/handlers.ts](src/grpc/handlers.ts#L175) وschema SweepTrace المسجل في [src/schemas/generated/index.ts](src/schemas/generated/index.ts#L1033) وتعريفه في [src/schemas/generated/index.ts](src/schemas/generated/index.ts#L751).
15. عند البث إلى socket، gateway يستدعي emitter.emit من [src/grpc/handlers.ts](src/grpc/handlers.ts#L353).
16. emitter يرسل للغرفة المحددة عبر Socket.IO في [src/socket/emitter.ts](src/socket/emitter.ts#L28) أو broadcast في [src/socket/emitter.ts](src/socket/emitter.ts#L33).

### نوع الرسالة على wire
1. SubscribeSweepRequest معرف في [src/proto/sdr.proto](src/proto/sdr.proto#L419).
2. session_id المطلوب للاشتراك موجود في [src/proto/sdr.proto](src/proto/sdr.proto#L420).
3. الرد هو SweepTrace معرف في [src/proto/sdr.proto](src/proto/sdr.proto#L458).
4. حقل القوى bytes powers_dbm في [src/proto/sdr.proto](src/proto/sdr.proto#L487).

### ملاحظة حدود هذا المشروع
توليد sweep نفسه من الهاردوير يحصل داخل خدمة SDR الخارجية (gRPC server الحقيقي)، وليس داخل هذا الريبو. داخل هذا الريبو أنت ترى نقطة الاستقبال من gRPC ثم relay إلى socket فقط.

---

## Workflow C: نفس العمليات لكن كـ Socket Event بدل REST

### إذا أرسلت event بدل REST
1. Socket event العام هو grpc:invoke معرف في [src/socket/index.ts](src/socket/index.ts#L22).
2. أو event خاص method-level يتبنى الصيغة grpc:invoke:Service.Method في [src/socket/index.ts](src/socket/index.ts#L27).
3. listener العام موجود في [src/socket/index.ts](src/socket/index.ts#L105).
4. listeners الخاصة بكل method تنبنى وتربط في [src/socket/index.ts](src/socket/index.ts#L66) ثم [src/socket/index.ts](src/socket/index.ts#L139).
5. بالنهايتين الاستدعاء يصل لنفس gateway.invoke في [src/socket/index.ts](src/socket/index.ts#L74).
6. نتيجة unary ترجع على grpc:result عبر [src/socket/index.ts](src/socket/index.ts#L76).
7. وأخطاء التنفيذ ترجع على grpc:error عبر [src/socket/index.ts](src/socket/index.ts#L92).

بهذا الشكل، سواء دخلت من Postman REST أو من Socket event، المسار المركزي للتنفيذ داخل المشروع هو نفسه داخل gateway.
