# DroneID Service — Quick Start Guide

## 🚀 الإعداد السريع للفرونت

### 1. الاتصال بـ Socket.IO

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to backend');
});
```

### 2. استقبال قائمة الخدمات

```javascript
socket.on('grpc:methods', (methods) => {
  const droneIdMethods = methods.filter(m => 
    m.serviceName === 'DroneIDService'
  );
  console.log('DroneID methods:', droneIdMethods);
});
```

### 3. بدء كشف الطائرات

```javascript
// وضع Ethernet (الافتراضي)
socket.emit('grpc:invoke:DroneIDService.StreamDrones', {
  connectionType: 'CONNECTION_ETHERNET',
  protocol: 'PROTOCOL_DJI',
  antsdrIp: '172.31.100.2',
  listenPort: 52002,
  zmqEndpoint: 'tcp://127.0.0.1:4221'
});

// أو وضع USB Serial
socket.emit('grpc:invoke:DroneIDService.StreamDrones', {
  connectionType: 'CONNECTION_USB_SERIAL',
  protocol: 'PROTOCOL_DJI',
  serialPort: '/dev/ttyUSB0',
  baudRate: 115200
});
```

### 4. استقبال البيانات

```javascript
socket.on('DroneIDService.StreamDrones', (payload) => {
  // طائرة مكتشفة
  if (payload.drone) {
    const drone = payload.drone;
    console.log(`🚁 ${drone.description}`, {
      serial: drone.serial,
      location: { lat: drone.droneLat, lon: drone.droneLon },
      altitude: drone.altitudeM,
      speed: drone.speedMs,
      signal: drone.rssi
    });
  }
  
  // رسالة حالة
  if (payload.statusMessage) {
    console.log('📡', payload.statusMessage);
  }
  
  // إشارة خام
  if (payload.rawSignal) {
    console.log('📊 Raw Signal:', payload.rawSignal.rssi, 'dBm');
  }
  
  // سجل الكونسول
  if (payload.consoleLog) {
    console.log(`[${payload.consoleLog.level}]`, payload.consoleLog.line);
  }
  
  // حالة الجهاز
  if (payload.hardwareStatus) {
    console.log('⚙️', payload.hardwareStatus);
  }
  
  // نتيجة الفحص
  if (payload.scanStatus) {
    console.log('📈 Scan:', payload.scanStatus);
  }
});
```

### 5. الاستعلام عن الحالة

```javascript
// حالة الخدمة الكلية
socket.emit('grpc:invoke:DroneIDService.GetStatus', {});
socket.on('DroneIDService.GetStatus', (status) => {
  console.log('Service Status:', {
    running: status.running,
    uptime: `${status.uptimeMs / 60000} min`,
    droneCount: status.droneCount,
    activeStreams: status.activeStreams
  });
});

// حالة جهاز ANTSDR
socket.emit('grpc:invoke:DroneIDService.GetAntSDRStatus', {});
socket.on('DroneIDService.GetAntSDRStatus', (status) => {
  console.log('AntSDR Status:', {
    connected: status.connected,
    source: status.source,
    lastDrone: new Date(Number(status.lastSignalMs))
  });
});
```

---

## 📊 أنواع البيانات الرئيسية

### DroneRecord
```javascript
{
  serial: string,              // رقم الطائرة
  protocol: string,            // DJI-O2, O3, O4 أو ASTM-F3411
  droneLat: number,            // GPS الطائرة
  droneLon: number,
  altitudeM: number,           // الارتفاع بالمتر
  speedMs: number,             // السرعة م/ث
  homeLat: number,             // نقطة الإقلاع
  homeLon: number,
  pilotLat: number,            // موقع الطيار
  pilotLon: number,
  rssi: number,                // قوة الإشارة dBm
  description: string,         // اسم الطراز
  motorOn: boolean,            // هل المحركات تعمل؟
  inAir: boolean,              // هل الطائرة في الجو؟
  gpsValid: boolean,           // هل GPS صحيح؟
  vNorthCms: number,           // مكونات السرعة (NED)
  vEastCms: number,
  vUpCms: number,
  stateInfo: string            // حالة من الطائرة
}
```

### RawSignal
```javascript
{
  protocol: string,            // "DJI-O2" إلخ
  rssi: number,
  model: string,
  serial: string,
  lat: number,
  lon: number,
  frequencyMhz: number,
  rawLine: string              // السطر الخام من ANTSDR
}
```

---

## 🎯 حالات الاستخدام الشائعة

### عرض الطائرات على الخريطة
```javascript
const drones = new Map();

socket.on('DroneIDService.StreamDrones', (payload) => {
  if (payload.drone) {
    drones.set(payload.drone.serial, payload.drone);
    updateMapMarkers(drones);
  }
});
```

### تسجيل البيانات الخام
```javascript
const rawSignals = [];

socket.on('DroneIDService.StreamDrones', (payload) => {
  if (payload.rawSignal) {
    rawSignals.push({
      timestamp: payload.timestampMs,
      data: payload.rawSignal
    });
    
    if (rawSignals.length > 1000) {
      saveToDatabase(rawSignals);
      rawSignals.length = 0;
    }
  }
});
```

### مراقبة الصحة
```javascript
setInterval(() => {
  socket.emit('grpc:invoke:DroneIDService.GetStatus', {});
}, 5000);

socket.on('DroneIDService.GetStatus', (status) => {
  if (!status.running) {
    alert('❌ DroneID Service stopped!');
  }
});
```

---

## ⚠️ معالجة الأخطاء

```javascript
socket.on('grpc:error', (error) => {
  console.error('gRPC Error:', {
    service: error.service,
    method: error.method,
    message: error.message,
    code: error.code
  });
  
  // الأكواد الشائعة:
  // UNAVAILABLE: الجهاز غير متصل
  // INVALID_ARGUMENT: معاملات خاطئة
  // TIMEOUT: انقطاع الاتصال
});

socket.on('grpc:result', (result) => {
  if (!result.success) {
    console.error('Request failed:', result.error);
  }
});
```

---

## 🔧 الإعدادات المتقدمة

### اتصال مخصص

```javascript
socket.emit('grpc:invoke:DroneIDService.StreamDrones', {
  connectionType: 'CONNECTION_ETHERNET',
  protocol: 'PROTOCOL_UNIVERSAL_RID',  // بدلاً من DJI
  antsdrIp: 'custom.ip.address',
  listenPort: 9999,                     // منفذ مخصص
  zmqEndpoint: 'tcp://custom:port'
});
```

### وضع Docker مع Serial

```javascript
socket.emit('grpc:invoke:DroneIDService.StreamDrones', {
  connectionType: 'CONNECTION_USB_SERIAL',
  serialPort: 'socket://host.docker.internal:9998',
  baudRate: 115200
});
```

---

## 📱 مثال تطبيق كامل (React)

```javascript
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function DroneTracker() {
  const [socket, setSocket] = useState(null);
  const [drones, setDrones] = useState(new Map());
  const [status, setStatus] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const newSocket = io('http://localhost:3000');
    
    newSocket.on('connect', () => {
      setConnected(true);
      console.log('✅ Connected');
    });
    
    newSocket.on('disconnect', () => {
      setConnected(false);
      console.log('❌ Disconnected');
    });
    
    newSocket.on('grpc:methods', (methods) => {
      console.log('Available methods:', methods);
    });
    
    setSocket(newSocket);
    
    return () => newSocket.close();
  }, []);

  const startTracking = () => {
    socket?.emit('grpc:invoke:DroneIDService.StreamDrones', {
      connectionType: 'CONNECTION_ETHERNET',
      protocol: 'PROTOCOL_DJI'
    });
  };

  const getStatus = () => {
    socket?.emit('grpc:invoke:DroneIDService.GetStatus', {});
  };

  useEffect(() => {
    if (!socket) return;
    
    socket.on('DroneIDService.StreamDrones', (payload) => {
      if (payload.drone) {
        setDrones(prev => new Map(prev).set(
          payload.drone.serial,
          payload.drone
        ));
      }
    });
    
    socket.on('DroneIDService.GetStatus', setStatus);
    
    return () => {
      socket.off('DroneIDService.StreamDrones');
      socket.off('DroneIDService.GetStatus');
    };
  }, [socket]);

  return (
    <div className="drone-tracker">
      <h1>🚁 Drone Tracker</h1>
      
      <div className="controls">
        <button onClick={startTracking} disabled={!connected}>
          Start Tracking
        </button>
        <button onClick={getStatus}>
          Get Status
        </button>
      </div>
      
      <div className="status">
        {status && (
          <div>
            <p>Running: {status.running ? '✅' : '❌'}</p>
            <p>Drones detected: {status.droneCount}</p>
            <p>Uptime: {Math.floor(status.uptimeMs / 60000)} min</p>
          </div>
        )}
      </div>
      
      <div className="drones-list">
        {Array.from(drones.values()).map(drone => (
          <div key={drone.serial} className="drone-card">
            <h3>{drone.description}</h3>
            <p>📍 {drone.droneLat.toFixed(4)}, {drone.droneLon.toFixed(4)}</p>
            <p>📏 {drone.altitudeM.toFixed(1)}m</p>
            <p>📡 {drone.rssi} dBm</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 📚 للمزيد من المعلومات

- [الدليل الشامل](./DroneID-Service-AR.md)
- [المخططات والهندسة](./DroneID-Architecture-Diagrams-AR.md)
- [أحداث Socket](./socket-events.md)
- [تقرير التكامل](./DroneID-Integration-Report-AR.md)

---

**مرحباً! 🎉 DroneID Service جاهز للاستخدام الآن!**
