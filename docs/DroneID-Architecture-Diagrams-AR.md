# المخططات والعمليات — خدمة DroneID

توثيق شامل للمخططات التدفقية والتزامن والعمليات الداخلية لخدمة DroneIDService.

---

## 1️⃣ المخطط التدفقي الكامل للعملية

```mermaid
graph TD
    A["العميل يتصل بـ Socket.IO"] -->|connect| B["الخادم يرسل grpc:methods"]
    B --> C["العميل يختار DroneIDService.StreamDrones"]
    C -->|grpc:invoke:DroneIDService.StreamDrones| D["الخادم يستدعي gRPC"]
    
    D --> E["استهداف جهاز ANTSDR"]
    E -->|ConnectionType| F{الاتصال؟}
    
    F -->|Ethernet| G["الاتصال بـ ZMQ\n/dji_receiver.py"]
    F -->|USB Serial| H["فتح منفذ\n/dev/ttyUSB0"]
    
    G --> I["بدء التدفق"]
    H --> I
    
    I --> J["استقبال البيانات الخام\n من ANTSDR/dji_receiver"]
    J --> K["معالجة البيانات"]
    K --> L{نوع البيانات؟}
    
    L -->|DroneRecord| M["طائرة مكتشفة\nمفكوكة بالكامل"]
    L -->|RawSignal| N["إشارة خام\nقبل الفك"]
    L -->|ConsoleLog| O["سطر من\nكونسول ANTSDR"]
    L -->|ScanStatus| P["نتيجة فحص\nPPM"]
    
    M --> Q["📤 إرسال DronePayload\nعلى Socket.IO"]
    N --> Q
    O --> Q
    P --> Q
    
    Q -->|DroneIDService.StreamDrones| R["العميل يستقبل البيانات\nفي الوقت الفعلي"]
    
    R --> S["عرض الطائرة على الخريطة\nأو في جدول"]
    
    A -->|الاستعلام| T["grpc:invoke:DroneIDService.GetStatus"]
    T -->|gRPC| U["الخادم يرد البيانات"]
    U -->|DroneIDService.GetStatus| V["عرض الإحصائيات"]
    
    style A fill:#e1f5ff
    style R fill:#c8e6c9
    style S fill:#fff9c4
    style V fill:#f0f4c3
```

---

## 2️⃣ مخطط التزامن (Concurrency Diagram)

```mermaid
sequenceDiagram
    actor U as User (Frontend)
    participant SO as Socket.IO Gateway
    participant GR as gRPC Service
    participant ZM as ZMQ/AntSDR
    
    U->>SO: connect
    SO->>SO: Load gRPC methods
    SO->>U: grpc:methods event
    
    U->>SO: grpc:invoke:DroneIDService.StreamDrones
    note over SO: Create stream handler
    SO->>GR: StreamDrones(request)
    note over GR: Connect to AntSDR
    GR->>ZM: Subscribe to ZMQ
    note over ZM: AntSDR outputs<br/>dji_O CSV lines
    
    par
        ZM-->>GR: Drone #1 detected
        GR-->>SO: DronePayload (drone)
        SO-->>U: DroneIDService.StreamDrones
        U->>U: Update UI
    and
        ZM-->>GR: Raw signal #2
        GR-->>SO: DronePayload (raw_signal)
        SO-->>U: DroneIDService.StreamDrones
        U->>U: Log raw data
    and
        ZM-->>GR: Console log
        GR-->>SO: DronePayload (console_log)
        SO-->>U: DroneIDService.StreamDrones
        U->>U: Display console
    end
    
    note over SO,U: Stream continues<br/>until user closes
    U->>SO: cancel stream
    SO->>GR: Cancel RPC
    GR->>ZM: Close ZMQ
    note over SO: Cleanup resources
```

---

## 3️⃣ مخطط هندسة النظام

```mermaid
graph LR
    subgraph Hardware["🔌 الأجهزة"]
        ANTSDR["ANTSDR E200 SDR<br/>جهاز استقبال راديو"]
    end
    
    subgraph Backend["⚙️ الخادم"]
        subgraph Python["Python Layer"]
            PY["dji_receiver.py<br/>(فك ترميز DJI)"]
        end
        
        subgraph Transport["Transport"]
            ZMQ["ZMQ Broker<br/>tcp://127.0.0.1:4221"]
            Serial["Serial Reader<br/>(USB/Socket)"]
        end
        
        subgraph Backend_Core["Node.js / gRPC"]
            GW["gRPC Server<br/>DroneIDService"]
            SIO["Socket.IO Gateway"]
            DB["Logger<br/>& DB"]
        end
    end
    
    subgraph Frontend["💻 الفرونت"]
        APP["Web App<br/>socket.io-client"]
        UI["Dashboard<br/>React/Vue"]
    end
    
    ANTSDR -->|Ethernet TCP<br/>port 52002| ZMQ
    ANTSDR -->|USB Serial<br/>/dev/ttyUSB0| Serial
    
    ZMQ -->|Subscribe| PY
    Serial -->|Read CSV| PY
    
    PY -->|Publish| ZMQ
    Serial -->|Read Lines| GW
    
    ZMQ -->|Consume| GW
    GW --> DB
    GW --> SIO
    
    SIO <-->|Socket.IO<br/>ws://| APP
    APP <--> UI
    
    style ANTSDR fill:#ffcccc
    style ZMQ fill:#ffffcc
    style Serial fill:#ffffcc
    style GW fill:#ccffcc
    style SIO fill:#ccffff
    style APP fill:#ffccff
    style UI fill:#ffddaa
```

---

## 4️⃣ دورة حياة الطلب (Request Lifecycle)

### 4.1) StreamDrones - طلب Streaming

```mermaid
stateDiagram-v2
    [*] --> IDLE: App starts
    
    IDLE --> CONNECTING: User clicks "Start Stream"
    
    CONNECTING --> AUTHENTICATE: Socket connected
    AUTHENTICATE --> CREATE_REQUEST: Build StreamRequest
    CREATE_REQUEST --> GRPC_CALL: Send to gRPC
    
    GRPC_CALL --> ANTSDR_CONNECT: Trying to connect\nto AntSDR
    ANTSDR_CONNECT --> SUBSCRIBE_DATA: Connected\nSubscribe to data
    
    SUBSCRIBE_DATA --> STREAMING: First payload received
    
    STREAMING --> STREAMING: Receiving drones...\nReceiving signals...\nReceiving console logs...
    
    STREAMING --> USER_CANCEL: User closes stream
    STREAMING --> ERROR: Connection lost
    
    ERROR --> RECONNECTING: Retry enabled?
    RECONNECTING --> STREAMING: Reconnected
    RECONNECTING --> CLOSED: Max retries reached
    
    USER_CANCEL --> CLEANUP: Close gRPC stream\nClose ZMQ\nClose Serial
    CLOSED --> CLEANUP
    
    CLEANUP --> IDLE: Resources freed
    
    style STREAMING fill:#c8e6c9
    style ERROR fill:#ffcccc
    style CLEANUP fill:#fff9c4
```

### 4.2) GetStatus - طلب Unary

```mermaid
stateDiagram-v2
    [*] --> REQUEST
    REQUEST --> VALIDATE: Received grpc:invoke
    VALIDATE --> CALL_GRPC: Input valid
    CALL_GRPC --> FETCH_STATS: Call gRPC.GetStatus()
    FETCH_STATS --> BUILD_RESPONSE: Gather stats
    BUILD_RESPONSE --> SEND_ACK: Send grpc:result
    SEND_ACK --> SEND_DATA: Send response payload
    SEND_DATA --> [*]
    
    VALIDATE --> ERROR: Invalid input
    ERROR --> [*]
    CALL_GRPC --> TIMEOUT: No response
    TIMEOUT --> ERROR
    
    style SEND_DATA fill:#c8e6c9
    style ERROR fill:#ffcccc
```

---

## 5️⃣ مخطط معالجة الأخطاء والاستعادة

```mermaid
graph TD
    A["خطأ في الاتصال\nبـ AntSDR"] -->|Error Code| B{Error Type?}
    
    B -->|UNAVAILABLE| C["الجهاز غير متصل"]
    B -->|INVALID_ARGUMENT| D["معاملات غير صحيحة"]
    B -->|TIMEOUT| E["انقطاع الاتصال"]
    
    C --> C1["✅ استراتيجية: تحديث عنوان IP"]
    D --> D1["✅ استراتيجية: تحقق من المنفذ"]
    E --> E1["✅ استراتيجية: إعادة محاولة مع تأخير"]
    
    C1 --> C2["إرسال رسالة للمستخدم:<br/>تحقق من توصيل الشبكة"]
    D1 --> D2["إرسال رسالة للمستخدم:<br/>المنفذ أو العنوان خاطئ"]
    E1 --> E2["محاولة إعادة الاتصال<br/>بعد 5 ثوانٍ"]
    
    C2 --> C3["العودة إلى IDLE"]
    D2 --> D3["طلب إدخال جديد"]
    E2 --> E4{هل عادت؟}
    
    E4 -->|نعم| E5["استئناف الستريم"]
    E4 -->|لا| E6["محاولة 2: انتظار 10s"]
    E6 --> E7{هل عادت؟}
    E7 -->|لا| E8["الفشل النهائي"]
    E8 --> E2
    
    style C1 fill:#fff9c4
    style D1 fill:#fff9c4
    style E1 fill:#fff9c4
    style E5 fill:#c8e6c9
    style E8 fill:#ffcccc
```

---

## 6️⃣ مخطط تدفق البيانات الداخلي

```mermaid
graph LR
    subgraph Input["📥 المدخلات"]
        I1["CSV Lines من<br/>ANTSDR Console"]
        I2["JSON من<br/>dji_receiver.py"]
    end
    
    subgraph Process["⚙️ المعالجة"]
        P1["Parser"]
        P2["Decoder"]
        P3["Enrichment"]
        P4["Serializer"]
    end
    
    subgraph Output["📤 المخرجات"]
        O1["DroneRecord"]
        O2["RawSignal"]
        O3["ConsoleLog"]
        O4["ScanStatus"]
    end
    
    subgraph Emit["📡 البث"]
        E1["Socket.IO Event"]
        E2["To Frontend"]
    end
    
    I1 --> P1
    I2 --> P1
    
    P1 --> P2
    P2 --> P3
    P3 --> P4
    
    P2 -->|raw| O2
    P2 -->|status| O3
    P2 -->|scan| O4
    P3 -->|full| O1
    
    O1 --> P4
    O2 --> P4
    O3 --> P4
    O4 --> P4
    
    P4 --> E1
    E1 --> E2
    
    E2 -->|DronePayload| E3["Frontend Updates UI"]
    
    style P1 fill:#c8e6c9
    style P2 fill:#c8e6c9
    style P3 fill:#c8e6c9
    style P4 fill:#c8e6c9
    style E3 fill:#ffccff
```

---

## 7️⃣ مخطط التوازي والـ Threading

```mermaid
graph TD
    subgraph Main["Main Thread"]
        M1["Event Loop<br/>Socket.IO"]
        M2["Request Handler"]
    end
    
    subgraph Background["Background Threads"]
        B1["Serial Reader\n(USB/Socket)"]
        B2["ZMQ Subscriber\n(Ethernet)"]
        B3["Decoder\n(Python subprocess)"]
        B4["Emitter\nto Socket.IO"]
    end
    
    subgraph Resource["Resources"]
        R1["Thread Pool\n(4-8 threads)"]
        R2["Message Queue"]
        R3["Lock/Mutex"]
    end
    
    M1 -->|grpc:invoke| M2
    M2 -->|Start| B1
    M2 -->|Start| B2
    M2 -->|Start| B3
    
    B1 -->|Raw data| R2
    B2 -->|JSON| R2
    B3 -->|Decoded| R2
    
    R2 -->|Dequeue| B4
    B4 -->|Emit| M1
    
    R1 -.->|Manages| B1
    R1 -.->|Manages| B2
    R1 -.->|Manages| B3
    R1 -.->|Manages| B4
    
    R3 -.->|Protects| R2
    
    style Main fill:#e3f2fd
    style Background fill:#f3e5f5
    style Resource fill:#fff9c4
```

---

## 8️⃣ مخطط المراقبة والصحة

```mermaid
graph TD
    subgraph Health["🏥 مؤشرات الصحة"]
        H1["Connected Streams Count"]
        H2["Avg Messages/sec"]
        H3["AntSDR CPU %"]
        H4["Memory Usage"]
        H5["Error Rate"]
    end
    
    subgraph Monitoring["📊 المراقبة"]
        M1["GetStatus RPC"]
        M2["Metrics Exporter"]
        M3["Health Check"]
    end
    
    subgraph Display["🖥️ العرض"]
        D1["Dashboard"]
        D2["Logs"]
        D3["Alerts"]
    end
    
    H1 --> M1
    H2 --> M1
    H3 --> M2
    H4 --> M2
    H5 --> M3
    
    M1 --> D1
    M2 --> D1
    M3 --> D3
    
    M1 -.->|logs| D2
    M2 -.->|logs| D2
    M3 -.->|logs| D2
    
    style Health fill:#fff9c4
    style Monitoring fill:#c8e6c9
    style Display fill:#ffccff
```

---

## 9️⃣ مثال عملي: تتبع طائرة من البداية

```mermaid
graph TD
    A["👤 المستخدم يضغط<br/>زر 'ابدأ الكشف'"]
    
    A --> B["📡 الفرونت يرسل:<br/>grpc:invoke:DroneIDService.StreamDrones"]
    
    B --> C["⚙️ الخادم يستدعي:<br/>gRPC StreamDrones"]
    
    C --> D{"اختيار طريقة الاتصال"}
    
    D -->|Ethernet| E["الاتصال بـ:<br/>tcp://172.31.100.2:52002"]
    D -->|USB| F["فتح المنفذ:<br/>/dev/ttyUSB0"]
    
    E --> G["الاشتراك في ZMQ:<br/>tcp://127.0.0.1:4221"]
    F --> H["قراءة CSV Lines<br/>من السيريال"]
    
    G --> I["استقبال JSON<br/>من dji_receiver.py"]
    H --> J["استقبال CSV<br/>مثل: dji_O,5,2452MHz..."]
    
    I --> K["فك ترميز البيانات<br/>و معالجتها"]
    J --> K
    
    K --> L["🚁 تم كشف طائرة:<br/>Mavic 3, Serial: ABC123<br/>Lat: 37.77, Lon: -122.41"]
    
    L --> M["إنشاء DronePayload"]
    
    M --> N["📤 إرسال عبر Socket.IO:<br/>DroneIDService.StreamDrones"]
    
    N --> O["💻 الفرونت يستقبل البيانات"]
    
    O --> P["🗺️ عرض الطائرة على الخريطة"]
    
    P --> Q["📋 إضافة إلى جدول البيانات"]
    
    Q --> R["🔔 إرسال إشعار للمستخدم"]
    
    style A fill:#ffccff
    style L fill:#c8e6c9
    style P fill:#ffffcc
    style R fill:#ffddaa
```

---

## 🔟 جدول مقارنة الأداء

### السيناريو الأول: Ethernet Mode

```
┌─────────────────────┬──────────┬──────────┬──────────┐
│ المقياس             │ الأفضل   │ الوسط    │ الأسوأ    │
├─────────────────────┼──────────┼──────────┼──────────┤
│ زمن الاتصال        │ < 0.5s   │ 1-2s     │ > 5s     │
│ تأخير الرسالة      │ < 100ms  │ 200-500ms│ > 1s     │
│ الذاكرة (per stream)│ < 5 MB   │ 10-20MB  │ > 50MB   │
│ CPU استهلاك        │ < 5%     │ 10-20%   │ > 50%    │
│ الاستقرار          │ 99.9%    │ 95%      │ < 90%    │
└─────────────────────┴──────────┴──────────┴──────────┘
```

### السيناريو الثاني: USB Serial Mode

```
┌─────────────────────┬──────────┬──────────┬──────────┐
│ المقياس             │ الأفضل   │ الوسط    │ الأسوأ    │
├─────────────────────┼──────────┼──────────┼──────────┤
│ زمن الاتصال        │ < 1s     │ 2-3s     │ > 10s    │
│ تأخير الرسالة      │ < 200ms  │ 400-800ms│ > 2s     │
│ الذاكرة (per stream)│ < 3 MB   │ 5-10MB   │ > 30MB   │
│ CPU استهلاك        │ < 3%     │ 5-10%    │ > 30%    │
│ الاستقرار          │ 99%      │ 90-95%   │ < 80%    │
└─────────────────────┴──────────┴──────────┴──────────┘
```

---

## 1️⃣1️⃣ قائمة التحقق من الجاهزية

- [ ] جهاز ANTSDR موصول فيزيائياً
- [ ] تشغيل dji_receiver.py (للوضع Ethernet)
- [ ] Ports والـ endpoints مفتوحة (52002, 4221)
- [ ] الفرونت يتصل بـ Socket.IO بنجاح
- [ ] الفرونت يستقبل `grpc:methods`
- [ ] طلب StreamDrones يأتي بـ acknowledgment
- [ ] أول `status_message` يصل دون تأخير
- [ ] عند الكشف، `DroneRecord` يصل مع البيانات الكاملة
- [ ] `GetStatus` يعود بـ uptime صحيح
- [ ] `GetAntSDRStatus` يظهر `connected: true`

---

## 📞 استكشاف الأخطاء

**المشكلة**: لا تصل أي بيانات
- **الحل**: تحقق من `GetAntSDRStatus.connected == true`

**المشكلة**: تأخير كبير بين الكشف والعرض
- **الحل**: راقب CPU استهلاك في الخادم

**المشكلة**: الذاكرة تنمو باستمرار
- **الحل**: قد يكون تسرب، أغلق الستريم واختبر مرة أخرى
