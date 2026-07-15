# Workflow Example Sweep (Socket + gRPC)

## الهدف الصحيح
هذا الملف يوثق المسار الحقيقي للأحداث التالية كأحداث Socket.IO مرتبطة بـ gRPC:
1. OpenDevice
2. SubscribeSweep

التركيز هنا على event flow فقط، وليس REST flow.

---

## أسماء الأحداث التي تهمك
1. الحدث العام للاستدعاء: grpc:invoke في [src/socket/index.ts](src/socket/index.ts#L22).
2. مولد اسم الحدث الخاص بكل طريقة: [src/socket/index.ts](src/socket/index.ts#L27).
3. OpenDevice كحدث خاص يصبح: grpc:invoke:DeviceControl.OpenDevice.
4. SubscribeSweep كحدث خاص يصبح: grpc:invoke:SpectrumStream.SubscribeSweep.
5. حدث النتيجة المغلفة: grpc:result في [src/socket/index.ts](src/socket/index.ts#L23).
6. حدث الخطأ: grpc:error في [src/socket/index.ts](src/socket/index.ts#L24).
7. حدث الداتا المنبعث من gateway لـ OpenDevice: DeviceControl.OpenDevice في [src/grpc/registry.ts](src/grpc/registry.ts#L178).
8. حدث الداتا المنبعث من gateway لـ SubscribeSweep: SpectrumStream.SubscribeSweep في [src/grpc/registry.ts](src/grpc/registry.ts#L300).

---

## كيف تتنقل سطر-بسطر أثناء التتبع
1. افتح [src/socket/index.ts](src/socket/index.ts#L47).
2. ابدأ من on connection في [src/socket/index.ts](src/socket/index.ts#L59).
3. انتقل لتعريف handleInvoke في [src/socket/index.ts](src/socket/index.ts#L72).
4. ثم اذهب إلى الاستدعاء المركزي gateway.invoke في [src/socket/index.ts](src/socket/index.ts#L74).
5. بعدها افتح [src/grpc/handlers.ts](src/grpc/handlers.ts#L522) وتتبع invoke بالكامل.
6. إذا كانت Unary ارجع لمسار [src/grpc/handlers.ts](src/grpc/handlers.ts#L525).
7. إذا كانت Server-stream ارجع لمسار [src/grpc/handlers.ts](src/grpc/handlers.ts#L585).
8. ارجع بعد ذلك لنقاط البث في [src/grpc/handlers.ts](src/grpc/handlers.ts#L349) و[src/grpc/handlers.ts](src/grpc/handlers.ts#L353).

---

## Workflow 1: حدث OpenDevice كـ Socket Event

### ما الذي ترسله من العميل
1. إما على الحدث العام grpc:invoke مع service=DeviceControl وmethod=OpenDevice.
2. أو مباشرة على الحدث الخاص grpc:invoke:DeviceControl.OpenDevice.

### خط التنفيذ الفعلي داخل المشروع
1. استقبال الحدث العام يتم في [src/socket/index.ts](src/socket/index.ts#L105).
2. استقبال الحدث الخاص method-level يتم في [src/socket/index.ts](src/socket/index.ts#L139).
3. في الحالتين، ينتهي التنفيذ إلى handleInvoke عبر [src/socket/index.ts](src/socket/index.ts#L127) أو [src/socket/index.ts](src/socket/index.ts#L142).
4. الاستدعاء المركزي إلى gateway يتم في [src/socket/index.ts](src/socket/index.ts#L74).
5. داخل gateway يتم resolve service/method في [src/grpc/handlers.ts](src/grpc/handlers.ts#L523) ثم [src/grpc/handlers.ts](src/grpc/handlers.ts#L230) و[src/grpc/handlers.ts](src/grpc/handlers.ts#L236).
6. OpenDevice مصنف Unary فيتجه المسار إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L525).
7. تحقق schema للطلب يبدأ من [src/grpc/handlers.ts](src/grpc/handlers.ts#L143) مع safeParse في [src/grpc/handlers.ts](src/grpc/handlers.ts#L150).
8. schema المقابل للطلب هو [src/schemas/generated/index.ts](src/schemas/generated/index.ts#L1014) وتعريفه في [src/schemas/generated/index.ts](src/schemas/generated/index.ts#L595).
9. تنفيذ gRPC unary call فعليا يحصل في [src/grpc/handlers.ts](src/grpc/handlers.ts#L547).
10. بعد الرد، gateway يعالج الرسالة في [src/grpc/handlers.ts](src/grpc/handlers.ts#L573).
11. البث للسوكت يتم عبر [src/grpc/handlers.ts](src/grpc/handlers.ts#L353) إلى الغرفة الخاصة بالعميل.
12. emitter ينفذ io.to(room).emit في [src/socket/emitter.ts](src/socket/emitter.ts#L28).
13. بالتوازي، socket layer يرجع نتيجة تغليف grpc:result في [src/socket/index.ts](src/socket/index.ts#L76).
14. لذلك ستشاهد شيئين للعميل: grpc:result وحدث DeviceControl.OpenDevice.

### أين تولد session_id
1. تعريف الحقل موجود في proto response: [src/proto/sdr.proto](src/proto/sdr.proto#L284).
2. القيمة نفسها تأتي من خدمة gRPC الخارجية (الهاردوير backend) وليس من كود هذا الريبو.

---

## Workflow 2: حدث SubscribeSweep كـ Socket Event

### ما الذي ترسله من العميل
1. إما grpc:invoke مع service=SpectrumStream وmethod=SubscribeSweep.
2. أو grpc:invoke:SpectrumStream.SubscribeSweep مباشرة.
3. payload يجب أن يحتوي sessionId كما في proto: [src/proto/sdr.proto](src/proto/sdr.proto#L420).

### خط التنفيذ الفعلي داخل المشروع
1. الاستقبال من السوكت يتم بنفس نقاط OpenDevice: [src/socket/index.ts](src/socket/index.ts#L105) و[src/socket/index.ts](src/socket/index.ts#L139).
2. التحويل إلى gateway.invoke يتم في [src/socket/index.ts](src/socket/index.ts#L74).
3. resolve service/method يتم في [src/grpc/handlers.ts](src/grpc/handlers.ts#L523) ثم [src/grpc/handlers.ts](src/grpc/handlers.ts#L230) و[src/grpc/handlers.ts](src/grpc/handlers.ts#L236).
4. SubscribeSweep مصنف server-stream فيمر عبر [src/grpc/handlers.ts](src/grpc/handlers.ts#L585).
5. بدء الاشتراك يحصل عبر [src/grpc/handlers.ts](src/grpc/handlers.ts#L586) داخل startServerStream في [src/grpc/handlers.ts](src/grpc/handlers.ts#L390).
6. gRPC stream call ينشأ فعليا هنا: [src/grpc/handlers.ts](src/grpc/handlers.ts#L414).
7. بمجرد وصول كل رسالة من gRPC، on data يعمل في [src/grpc/handlers.ts](src/grpc/handlers.ts#L438).
8. الرسالة تنتقل إلى emitValidatedMessage في [src/grpc/handlers.ts](src/grpc/handlers.ts#L445).
9. تطبيع payload يبدأ في [src/grpc/handlers.ts](src/grpc/handlers.ts#L345) داخل normalizeResponsePayload في [src/grpc/handlers.ts](src/grpc/handlers.ts#L245).
10. تحويل powersDbm إلى Binary Buffer يتم هنا: [src/grpc/handlers.ts](src/grpc/handlers.ts#L252) باستخدام helper [src/grpc/handlers.ts](src/grpc/handlers.ts#L126).
11. تحقق schema للرد يتم عبر [src/grpc/handlers.ts](src/grpc/handlers.ts#L175).
12. schema SweepTrace هو [src/schemas/generated/index.ts](src/schemas/generated/index.ts#L1033) وتعريفه في [src/schemas/generated/index.ts](src/schemas/generated/index.ts#L751).
13. البث الفعلي للغرفة يتم في [src/grpc/handlers.ts](src/grpc/handlers.ts#L353) ثم [src/socket/emitter.ts](src/socket/emitter.ts#L28).
14. event الذي يصلك للبيانات هو SpectrumStream.SubscribeSweep حسب registry: [src/grpc/registry.ts](src/grpc/registry.ts#L300).
15. ملاحظة: أول رد سريع على طلب الاشتراك نفسه يرجع كـ grpc:result من [src/socket/index.ts](src/socket/index.ts#L76)، ثم تبدأ رسائل sweep المتتالية كأحداث منفصلة.

---

## نقاط تتبع مهمة بالـ Debugger
1. ضع breakpoint على [src/socket/index.ts](src/socket/index.ts#L105) لالتقاط الحدث العام.
2. ضع breakpoint على [src/socket/index.ts](src/socket/index.ts#L139) لالتقاط الحدث الخاص.
3. ضع breakpoint على [src/socket/index.ts](src/socket/index.ts#L74) لتأكيد الخدمة والطريقة والpayload.
4. ضع breakpoint على [src/grpc/handlers.ts](src/grpc/handlers.ts#L523) لتأكيد resolve داخل gateway.
5. في OpenDevice ضع breakpoint على [src/grpc/handlers.ts](src/grpc/handlers.ts#L547).
6. في SubscribeSweep ضع breakpoint على [src/grpc/handlers.ts](src/grpc/handlers.ts#L414) و[src/grpc/handlers.ts](src/grpc/handlers.ts#L438).
7. لتتبع معالجة powersDbm ضع breakpoint على [src/grpc/handlers.ts](src/grpc/handlers.ts#L252).
8. لتأكيد الإرسال النهائي للعميل ضع breakpoint على [src/socket/emitter.ts](src/socket/emitter.ts#L28).

---

## حدود التوثيق
هذا الملف يوثق كل السطور المنفذة داخل هذا الريبو. أما التنفيذ الداخلي لخدمة SDR/gRPC التي تتعامل مع الهاردوير نفسه فهو خارج هذا المشروع ولا يمكن توثيقه بأسطر من هنا.
