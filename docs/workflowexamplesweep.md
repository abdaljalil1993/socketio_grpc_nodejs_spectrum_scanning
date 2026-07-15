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

### الأسطر البرمجية المنفذة حرفيا (OpenDevice)
المقتطف التالي هو المسار الفعلي من استقبال حدث السوكت إلى تنفيذ unary gRPC ثم إعادة النتيجة:

```ts
// src/socket/index.ts
socket.on(SOCKET_INVOKE_EVENT, async (message: unknown) => {
	...
	await handleInvoke(
		{
			service: request.service,
			method: request.method,
			payload: request.payload,
			requestId: typeof request.requestId === 'string' ? request.requestId : undefined
		},
		SOCKET_INVOKE_EVENT,
	);
});

const handleInvoke = async ({ service, method, payload, requestId }: SocketInvokeRequest, triggerEvent: string) => {
	const result = await gateway.invoke(service, method, payload ?? {}, { targetRoom: socket.id });

	socket.emit(SOCKET_RESULT_EVENT, {
		requestId,
		triggerEvent,
		service,
		method,
		result
	});
};

// src/grpc/handlers.ts
async invoke(serviceName, methodName, payload, options) {
	const { service, method } = resolveMethod(serviceName, methodName);

	if (isUnaryMethod(method)) {
		const parsedPayload = validateRequestWithSchema(method.definition.requestType, payload, logger);

		const response = await new Promise<unknown>((resolve, reject) => {
			(service.client as any)[method.clientMethodName](parsedPayload, (error, result) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(result);
			});
		});

		const emittedPayload = emitValidatedMessage(service, method, response, {
			broadcast: !options?.targetRoom,
			targetRooms: new Set(options?.targetRoom ? [options.targetRoom] : [])
		});

		return {
			mode: 'unary',
			eventName: method.definition.eventName,
			payload: emittedPayload
		};
	}
}

// src/grpc/handlers.ts -> emitValidatedMessage
for (const room of delivery.targetRooms) {
	emitter.emit(method.definition.eventName, validatedPayload, { room });
}

// src/socket/emitter.ts
if (options?.room) {
	io.to(options.room).emit(eventName, payload);
}
```

تفسير السطور، سطر-بسطر (نفس الترتيب التنفيذي):
1. listener على الحدث العام يبدأ في [src/socket/index.ts](src/socket/index.ts#L105) ويستقبل الرسالة الخام.
2. سطور التحقق تضمن أن الخدمة والطريقة سترنغ، وإلا يرجع grpc:error من [src/socket/index.ts](src/socket/index.ts#L118).
3. استدعاء handleInvoke يتم في [src/socket/index.ts](src/socket/index.ts#L127) أو عبر الحدث الخاص في [src/socket/index.ts](src/socket/index.ts#L142).
4. السطر [src/socket/index.ts](src/socket/index.ts#L74) هو نقطة العبور الأساسية من السوكت إلى gRPC gateway.
5. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L523) يبدأ invoke داخل gateway.
6. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L230) يتم جلب service من clients map.
7. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L236) يتم جلب method داخل service.
8. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L525) يتأكد أنه Unary وليس stream.
9. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L526) يتم validate للـ payload بحسب schema type.
10. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L547) يتم استدعاء gRPC method الفعلي على client.
11. عند رجوع response، [src/grpc/handlers.ts](src/grpc/handlers.ts#L573) تمرر الرسالة لدالة emitValidatedMessage.
12. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L353) يتم إرسال الحدث الخاص (DeviceControl.OpenDevice) لغرفة السوكيت.
13. في [src/socket/emitter.ts](src/socket/emitter.ts#L28) يتم io.to(room).emit فعليا للعميل نفسه.
14. بالتوازي، socket layer يعيد wrapper نتيجة الاستدعاء على grpc:result في [src/socket/index.ts](src/socket/index.ts#L76).

### مسار التنقل الحرفي للمبتدئ (OpenDevice)
اتبع هذه الخطوات بنفس الترتيب، ولا تنتقل للخطوة التالية قبل التأكد من الحالية:
1. اذهب إلى [src/socket/index.ts](src/socket/index.ts#L105). هذا أول listener يستقبل grpc:invoke.
2. أرسل حدث OpenDevice من العميل. توقف هنا وتأكد أن message وصل لهذا السطر.
3. انزل إلى [src/socket/index.ts](src/socket/index.ts#L115). هنا يتم تحويل الرسالة إلى request.
4. انزل إلى [src/socket/index.ts](src/socket/index.ts#L127). هنا يتم استدعاء handleInvoke.
5. اقفز إلى [src/socket/index.ts](src/socket/index.ts#L72). هذا تعريف handleInvoke نفسه.
6. تحرك إلى [src/socket/index.ts](src/socket/index.ts#L74). هنا يحصل الدخول الحقيقي إلى gateway.invoke.
7. اقفز الآن إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L522). هذا مدخل invoke داخل gateway.
8. تحرك إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L523). هنا resolveMethod يأخذ serviceName وmethodName.
9. اقفز إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L230). هنا يجلب service من clients.
10. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L236). هنا يجلب method داخل service.
11. ارجع إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L525). هنا التفرع: هل الطريقة Unary.
12. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L526). هنا يبدأ validateRequestWithSchema.
13. اقفز إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L143). هنا يتم أخذ schema من schemaRegistry.
14. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L150). هنا safeParse للـ payload.
15. ارجع إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L547). هنا gRPC unary call الفعلي.
16. بعد رجوع result، تحرك إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L573). هنا يتم تمرير الرد إلى emitValidatedMessage.
17. اقفز إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L345). هنا normalizeResponsePayload ثم validateResponseWithSchema.
18. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L353). هنا emit للغرفة المستهدفة.
19. اقفز إلى [src/socket/emitter.ts](src/socket/emitter.ts#L28). هنا Socket.IO يرسل الحدث فعليا للعميل.
20. ارجع إلى [src/socket/index.ts](src/socket/index.ts#L76). هنا يرجع grpc:result (النتيجة المغلفة).
21. النتيجة النهائية عند العميل تكون حدثين: grpc:result وDeviceControl.OpenDevice.

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

### الأسطر البرمجية المنفذة حرفيا (SubscribeSweep)
المقتطف التالي هو المسار الفعلي لفتح stream ثم معالجة كل frame قادم:

```ts
// src/socket/index.ts
const result = await gateway.invoke(service, method, payload ?? {}, { targetRoom: socket.id });

// src/grpc/handlers.ts
if (isServerStreamMethod(method)) {
	const started = startServerStream(service, method, payload, 'api', options?.targetRoom);

	return {
		mode: 'server-stream',
		...started
	};
}

const startServerStream = (...) => {
	const parsedPayload = validateRequestWithSchema(method.definition.requestType, payload, logger);
	const streamKey = `${service.definition.fullServiceName}.${method.definition.methodName}:${stableStringify(parsedPayload)}`;

	const call = (service.client as any)[method.clientMethodName](parsedPayload) as ClientReadableStream<unknown>;

	activeStreams.set(streamKey, { metadata, delivery, call });

	call.on('data', (message) => {
		const currentStream = activeStreams.get(streamKey);
		if (!currentStream) {
			return;
		}
		emitValidatedMessage(service, method, message, currentStream.delivery);
	});
};

const normalizeResponsePayload = (payload: unknown, responseType: string): unknown => {
	if (responseType === 'sdr_ingestion.v2.SweepTrace') {
		const sweep = payload as Record<string, unknown>;
		const binaryPowers = toBinaryBuffer(sweep['powersDbm']);
		return {
			...sweep,
			powersDbm: binaryPowers
		};
	}
};

for (const room of delivery.targetRooms) {
	emitter.emit(method.definition.eventName, validatedPayload, { room });
}
```

تفسير السطور، سطر-بسطر (نفس الترتيب التنفيذي):
1. الدخول من السوكت إلى gateway يبدأ من [src/socket/index.ts](src/socket/index.ts#L74).
2. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L585) يتم تمييز الطريقة كـ server-stream.
3. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L586) يبدأ startServerStream مع targetRoom.
4. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L396) يتم validate للطلب حسب SubscribeSweepRequest schema.
5. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L397) يتم توليد streamKey لتمييز الاشتراك.
6. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L414) يتم فتح stream call مع gRPC backend.
7. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L427) يتم حفظه في activeStreams.
8. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L438) يبدأ listener لكل data message قادمة.
9. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L445) تمر كل رسالة إلى emitValidatedMessage.
10. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L345) يبدأ normalizeResponsePayload للرسالة.
11. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L252) يتم تحويل powersDbm إلى Binary Buffer.
12. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L346) يتم validate response schema بعد التطبيع.
13. في [src/grpc/handlers.ts](src/grpc/handlers.ts#L353) يتم emit حدث SpectrumStream.SubscribeSweep لغرفة العميل.
14. التنفيذ النهائي على Socket.IO يتم في [src/socket/emitter.ts](src/socket/emitter.ts#L28).
15. اسم الحدث SpectrumStream.SubscribeSweep يأتي من registry في [src/grpc/registry.ts](src/grpc/registry.ts#L300).

### مسار التنقل الحرفي للمبتدئ (SubscribeSweep)
اتبع هذه الخطوات بنفس الترتيب. هذا المسار stream وليس unary:
1. اذهب إلى [src/socket/index.ts](src/socket/index.ts#L139) إذا كنت تستخدم الحدث الخاص grpc:invoke:SpectrumStream.SubscribeSweep.
2. أو ابدأ من [src/socket/index.ts](src/socket/index.ts#L105) إذا كنت تستخدم الحدث العام grpc:invoke.
3. في الحالتين، تأكد أن التنفيذ يصل إلى [src/socket/index.ts](src/socket/index.ts#L74) عند gateway.invoke.
4. اقفز إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L522) ثم إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L523).
5. اقفز إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L230) ثم [src/grpc/handlers.ts](src/grpc/handlers.ts#L236) لتأكيد resolve.
6. ارجع إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L585). هنا يتم تمييز الطريقة كـ server-stream.
7. انتقل مباشرة إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L586). هنا يبدأ startServerStream.
8. اقفز إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L390). هذا تعريف startServerStream.
9. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L396). هنا validateRequestWithSchema لطلب SubscribeSweep.
10. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L397). هنا streamKey يتم توليده.
11. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L414). هنا يتم فتح gRPC stream call.
12. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L427). هنا يتم تخزين stream في activeStreams.
13. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L438). هنا listener data لكل رسالة SweepTrace.
14. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L445). هنا كل رسالة تدخل emitValidatedMessage.
15. اقفز إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L345). هنا يبدأ normalizeResponsePayload.
16. اقفز إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L245). هذا تعريف normalizeResponsePayload.
17. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L252). هنا powersDbm يتحول إلى Binary Buffer.
18. ارجع إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L346). هنا validateResponseWithSchema بعد التطبيع.
19. انزل إلى [src/grpc/handlers.ts](src/grpc/handlers.ts#L353). هنا يتم emit لحدث SpectrumStream.SubscribeSweep.
20. اقفز إلى [src/socket/emitter.ts](src/socket/emitter.ts#L28). هنا النقل النهائي إلى العميل.
21. تأكد من اسم الحدث في [src/grpc/registry.ts](src/grpc/registry.ts#L300).
22. تذكر أن grpc:result من [src/socket/index.ts](src/socket/index.ts#L76) هو رد بدء الاشتراك فقط، أما الداتا الفعلية فتأتي لاحقا من callback data.

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
