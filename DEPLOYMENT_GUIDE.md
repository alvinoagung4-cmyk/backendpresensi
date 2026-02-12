# 📋 PANDUAN DEPLOYMENT BACKEND KE CLOUD

## Pilihan 1: Deploy ke Railway.app (RECOMMENDED - Gratis)

### Kelebihan Railway:
- ✅ Gratis dengan $5/bulan credit (cukup untuk project kecil)
- ✅ Instant deploy dari GitHub
- ✅ Support PostgreSQL cloud terintegrasi
- ✅ Auto-scaling
- ✅ Custom domain support
- ✅ Monitoring dan logging

### Langkah-langkah:

#### A. Siapkan GitHub Repository
1. Push project ke GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/projectone-backend.git
git branch -M main
git push -u origin main
```

#### B. Login ke Railway.app
1. Buka https://railway.app
2. Sign up dengan GitHub account
3. Authorize railway.app

#### C. Create New Project di Railway
1. Klik "Create New Project"
2. Pilih "Deploy from GitHub repo"
3. Pilih repository `projectone-backend`
4. Railway akan auto-detect Node.js project

#### D. Setup Database (PostgreSQL)
1. Di dashboard Railway, klik "+ New"
2. Pilih "Database" → "PostgreSQL"
3. Tunggu PostgreSQL created
4. Railway akan auto-generate DATABASE_URL

#### E. Setup Environment Variables
1. Buka Settings tab
2. Klik "Variables" 
3. Tambahkan:
```
PORT=3001
NODE_ENV=production
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
CORS_ORIGIN=*
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_specific_password
```

4. DATABASE_URL otomatis dari PostgreSQL service

#### F. Deploy
1. Railway akan auto-deploy saat push ke GitHub
2. Lihat logs di "Deployments" tab

---

## Pilihan 2: Deploy ke Render.com (Alternatif)

### Kelebihan Render:
- ✅ Lebih stabil untuk production
- ✅ PostgreSQL terintegrasi
- ✅ Free tier untuk testing
- ✅ Auto-deploy dari GitHub

### Langkah:
1. Buka https://render.com
2. Sign up dengan GitHub
3. Create "New +" → "Web Service"
4. Connect GitHub repo
5. Build command: `npm install`
6. Start command: `npm start`
7. Add PostgreSQL service
8. Deploy

---

## Pilihan 3: Deploy ke Heroku (Legacy - Berbayar sekarang)

Heroku sudah tidak free lagi, tapi beberapa hosting lain lebih murah.

---

## Update Database Connection String

Setelah deploy ke cloud, database URL biasanya format:
```
postgresql://user:password@host:port/database
```

Update `backend/config/database.js`:
```javascript
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
```

---

## Testing Deployment

Setelah deploy, test backend dengan:

```bash
curl https://your-railway-app-url.railway.app/health
```

Atau dari Flutter app, update:
```dart
final backendUrl = 'https://your-railway-app-url.railway.app';
```

---

## Monitoring & Logs

- **Railway**: Dashboard → Logs tab
- **Render**: Services → Logs
- Buat alert jika server down

---

## Auto-restart jika Server Crash

Railway dan Render sudah auto-restart.

Untuk monitoring ekstra:
1. Tambahkan health check endpoint di backend:
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});
```

2. Setup uptime monitoring (UptimeRobot.com - free)

---

## PENTING: Database Migration

Jika sudah ada data lokal yang ingin dipindahkan:

1. Export dari PostgreSQL lokal:
```bash
pg_dump -U postgres -d projectone > backup.sql
```

2. Restore ke cloud database:
```bash
psql postgresql://user:pass@cloud-host:5432/dbname < backup.sql
```

---

Setelah deployment berhasil, aplikasi Flutter Anda bisa langsung connect ke backend cloud tanpa ngrok! 🚀
