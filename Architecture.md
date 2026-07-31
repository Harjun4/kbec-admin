# Architecture Documentation — KBEC Admin System

## System Overview
Sistem Informasi Manajemen & Administrasi KBEC menggunakan arsitektur **Node.js (Express.js) + MySQL (TiDB Cloud)** dengan pendekatan modular (Layered Architecture).

## Folder Structure
```
kbec-admin/
├── api/
│   └── index.js              # Entrypoint Vercel Serverless Function
├── public/                    # Production Static Assets (HTML, CSS, JS)
│   ├── css/
│   ├── js/
│   ├── favicon.svg
│   └── *.html                 # Admin Pages
├── scripts/
│   └── seed.js                # Standalone Database Seeding & Migration CLI Script
├── src/
│   ├── config/
│   │   └── db.js              # MySQL Connection Pool Configuration
│   ├── controllers/           # Business Logic Controllers
│   │   └── auth.controller.js
│   ├── middlewares/           # Express Middlewares
│   │   ├── auth.middleware.js # JWT & RBAC Authorization & CSRF Protection
│   │   ├── error.middleware.js# Centralized Production Error Handler
│   │   ├── rateLimiter.middleware.js # Rate Limiting
│   │   └── validate.middleware.js    # Zod Input Validation Schemas
│   ├── routes/                # Modular Express Routers
│   │   └── auth.routes.js
│   └── utils/
├── tests/
│   └── auth.test.js           # Automated Integration & Unit Tests
├── server.js                  # Main Express Application Core
├── schema.sql                 # MySQL Database DDL & B-Tree Indexes
├── package.json
└── tailwind.config.js         # Tailwind CLI Configuration with Dynamic Class Safelist
```

## Security & Access Control
- **Authentication**: Stateless JSON Web Token (JWT) dengan durasi 24 jam.
- **Authorization**: Role-Based Access Control (RBAC) middleware (`requireRole('Super Admin', 'Admin')`).
- **Encryption**: Hashing password menggunakan `bcrypt` dengan faktor kerja 10.
- **CSRF Protection**: Permintaan mutasi data (POST/PUT/DELETE) memverifikasi header custom CSRF / Bearer token.
- **Security Headers**: Dilindungi oleh pustaka `helmet`.
