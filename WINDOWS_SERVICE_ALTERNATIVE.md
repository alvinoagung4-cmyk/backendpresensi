# Alternative: Windows Background Service (Optional)

**Catatan:** Opsi ini HANYA untuk menjalankan backend saat laptop menyala. Aplikasi TIDAK bisa akses dari device lain. Untuk kebutuhan Anda (laptop bisa mati), gunakan Railway.app.

---

## Jika Ingin Backend Jalan di Background (Windows Only)

### Menggunakan Node Windows Service Manager (nssm.exe)

#### CARA 1: NSSM (Recommended)

**Step 1: Download NSSM**
1. Download dari https://nssm.cc/download
2. Extract ke folder (contoh: `C:\nssm`)
3. Copy `nssm.exe` dari `win64` folder

**Step 2: Install sebagai Service**

```bash
# Terminal (Admin)
cd C:\nssm\win64

# Install backend sebagai service
nssm install AttendanceBackend "C:\Program Files\nodejs\node.exe" "C:\Users\acer swift 3\AndroidStudioProjects\projectone\backend\server.js"

# Set auto-start
nssm set AttendanceBackend Start SERVICE_AUTO_START
```

**Step 3: Start Service**

```bash
# Terminal (Admin)
nssm start AttendanceBackend
```

**Step 4: Verify Running**

```bash
# Terminal
curl http://localhost:3001/health
```

**Stop Service:**
```bash
nssm stop AttendanceBackend
```

**Remove Service:**
```bash
nssm remove AttendanceBackend confirm
```

---

### CARA 2: PM2 (Node.js Process Manager)

```bash
# Terminal di backend folder
npm install -g pm2

# Start backend
pm2 start server.js --name "attendance-backend"

# Auto-start saat boot
pm2 startup
pm2 save

# Stop/Restart
pm2 stop attendance-backend
pm2 restart attendance-backend
```

---

### CARA 3: Windows Task Scheduler

**Step 1: Buat batch file (`start-backend.bat`)**

```batch
@echo off
cd C:\Users\acer swift 3\AndroidStudioProjects\projectone\backend
node server.js
pause
```

**Step 2: Open Task Scheduler**
- Windows + R → `taskschd.msc`
- Create Task → Set trigger: "At startup"
- Action: Start program → `cmd.exe`
- Arguments: `/k C:\path\to\start-backend.bat`

---

## ❌ Kekurangan Windows Service

1. **Laptop Harus Hidup** - Aplikasi tidak bisa akses saat laptop mati
2. **Perlu USB Tethering** - Hanya bisa dari device terhubung ke laptop
3. **Tidak Scalable** - Tidak bisa handle banyak user
4. **Manual Restart** - Harus restart manual jika crash
5. **Tidak Aman** - Tidak ada SSL/HTTPS
6. **Development Only** - Tidak cocok untuk production

---

## ✅ Solusi Terbaik: Cloud Deployment

Jangan gunakan Windows service!
Gunakan Railway.app → Backend 24/7 + Aman + Pro!

---

**Rekomendasi: SKIP BAGIAN INI DAN GUNAKAN RAILWAY.APP** ✅
