# Plumbing Dispatch Hub

A scheduling and job management application for plumbing businesses. Book appointments, assign employees, track daily schedules, and generate job completion reports.

## Project Goals

1. **Appointment Booking** - Take appointments for clients with customer details, job description, date/time, and employee assignment
2. **Employee Scheduling** - Allow employees (Kevin & Erik) to view their assigned work for any given day
3. **Job Reports** - Complete detailed reports after each job including work summary, parts used, and pricing
4. **Client Confirmation** - Send SMS confirmation with a PDF receipt to the client's phone upon job completion
5. **Data Persistence** - Save all bookings and reports to a database

---

## Features

### Current Features
- **New Booking Form** - Create appointments with customer name, phone, address, job description, date/time, and employee assignment
- **Today's Schedule View** - Filter jobs by date and employee
- **Availability Calendar** - Monthly view showing all booked jobs color-coded by employee
- **Job Report Modal** - Complete reports with:
  - AI-powered voice memo transcription (OpenAI)
  - Work summary and parts used tracking
  - Auto-calculated pricing based on job keywords
  - Digital signature capture
- **Google Maps Integration** - Quick address verification
- **Real-time Sync** - All data syncs in real-time across devices

### Planned Features
- [ ] SMS confirmation to clients (requires Twilio integration)
- [ ] PDF receipt generation (requires backend service)
- [ ] Employee login/authentication
- [ ] Job history and search
- [ ] Invoice management

---

## Tech Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| **Frontend** | HTML, CSS, JavaScript | Vanilla JS, no frameworks |
| **Database** | Firebase Firestore | Real-time NoSQL database |
| **Authentication** | Firebase Auth | Currently anonymous auth |
| **AI Assistant** | OpenAI API (gpt-4o-mini) | Voice memo transcription |
| **Maps** | Google Maps | Address verification |

### Why Firebase?

**Yes, Firebase is the right choice for this project.** Here's why:

1. **Real-time Sync** - Firestore provides real-time listeners, so when a booking is created or updated, all connected devices see the change instantly
2. **No Backend Required** - Firebase handles authentication and database without needing a separate server
3. **Scalable** - Grows with your business
4. **Offline Support** - Works offline and syncs when back online
5. **Cost-Effective** - Free tier is generous for small businesses

---

## Project Structure

```
Plumbing_V1/
├── index.html      # Main HTML structure
├── styles.css      # All styling
├── app.js          # Application logic & Firebase integration
└── README.md       # This file
```

---

## Setup Instructions

### 1. Firebase Setup (Already Configured)

The app is configured to use Firebase project: `plumber---app`

To use your own Firebase project:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Firestore Database** (start in test mode)
4. Enable **Authentication** > **Anonymous** sign-in
5. Copy your config to `app.js`

### 2. OpenAI API Key

Add your OpenAI API key in `app.js` line 15:
```javascript
const OPENAI_API_KEY = "sk-your-api-key-here";
```

### 3. Run the App

Use a local server (required for Firebase):

```bash
# Option 1: Python
python3 -m http.server 8000

# Option 2: Node.js
npx serve

# Option 3: VS Code Live Server extension
# Right-click index.html > "Open with Live Server"
```

Then open `http://localhost:8000` in your browser.

---

## SMS & PDF Implementation Guide

The SMS and PDF features require a backend server. Here's the recommended approach:

### Option A: Firebase Cloud Functions (Recommended)

```
Client completes report
        ↓
Firebase Firestore (save report)
        ↓
Cloud Function triggers on document write
        ↓
Generate PDF (using pdf-lib or PDFKit)
        ↓
Send SMS via Twilio with PDF link
        ↓
Store PDF in Firebase Storage
```

**Services Needed:**
- **Twilio** - SMS service (~$0.0075/SMS)
- **Firebase Cloud Functions** - Serverless backend
- **Firebase Storage** - Store generated PDFs

### Option B: External Backend

Use a Node.js/Express server with:
- `twilio` npm package for SMS
- `pdfkit` or `puppeteer` for PDF generation

### Firestore Data Structure

```
artifacts/
└── plumber---app/
    └── public/
        └── data/
            └── bookings/
                └── {bookingId}/
                    ├── customerName: string
                    ├── phoneNumber: string
                    ├── address: string
                    ├── jobDescription: string
                    ├── date: string (YYYY-MM-DD)
                    ├── time: string (HH:MM)
                    ├── employee: string
                    ├── status: string
                    ├── timestamp: timestamp
                    ├── reportSummary: string
                    ├── partsUsed: array
                    ├── finalPrice: number
                    ├── signatureData: string (base64)
                    └── reportFinalized: boolean
```

---

## Security Considerations

**Before going to production:**

1. **API Keys** - Move OpenAI API key to a backend server (never expose in client-side code)
2. **Firestore Rules** - Update security rules to restrict access:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /artifacts/{appId}/public/data/bookings/{doc} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
3. **Authentication** - Implement proper user authentication for employees
4. **HTTPS** - Always use HTTPS in production

---

## Employees

| Name | Color Code |
|------|------------|
| Kevin | Blue |
| Erik | Red |

To add more employees, edit the `EMPLOYEES` array in `app.js`:
```javascript
const EMPLOYEES = [
    { name: 'Kevin', ... },
    { name: 'Erik', ... },
    { name: 'NewEmployee', color: '...', ... },
];
```

---

## License

Private - For internal business use only.
