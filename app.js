// --- Global Firebase Variables (Provided by Canvas Environment) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Gemini API Constants
const GEMINI_API_KEY = ""; // Use the empty string for automatic key injection
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
const MAX_RETRIES = 5;

// Helper to format date as YYYY-MM-DD
const formatDate = (date) => date.toISOString().split('T')[0];

// Define employees and their visual properties
const EMPLOYEES = [
    { name: 'Kevin', color: 'bg-blue-600', hover: 'hover:bg-blue-700', text: 'text-blue-100', calendarClass: 'calendar-booking-kevin', chipClass: 'employee-chip-kevin' },
    { name: 'Erik', color: 'bg-red-600', hover: 'hover:bg-red-700', text: 'text-red-100', calendarClass: 'calendar-booking-erik', chipClass: 'employee-chip-erik' },
];

const EmployeeColorMap = new Map(EMPLOYEES.map(e => [e.name, e]));

// --- App State ---
let db = null;
let auth = null;
let userId = null;
let isAuthReady = false;
let bookings = [];
let currentView = 'newBooking';
let loading = true;
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedJobForReport = null;
let unsubscribeFirestore = null;

// Signature canvas state
let isDrawing = false;
let isSigned = false;
let signatureCtx = null;

// --- DOM Elements ---
const elements = {};

// Initialize DOM element references
function initElements() {
    elements.userId = document.getElementById('userId');
    elements.loadingIndicator = document.getElementById('loadingIndicator');
    elements.mainContent = document.getElementById('mainContent');

    // Navigation
    elements.navNewBooking = document.getElementById('navNewBooking');
    elements.navTodaySchedule = document.getElementById('navTodaySchedule');
    elements.navAvailability = document.getElementById('navAvailability');

    // Views
    elements.newBookingView = document.getElementById('newBookingView');
    elements.todayScheduleView = document.getElementById('todayScheduleView');
    elements.availabilityView = document.getElementById('availabilityView');

    // New Booking Form
    elements.bookingForm = document.getElementById('bookingForm');
    elements.bookingError = document.getElementById('bookingError');
    elements.employee = document.getElementById('employee');
    elements.customerName = document.getElementById('customerName');
    elements.phoneNumber = document.getElementById('phoneNumber');
    elements.address = document.getElementById('address');
    elements.jobDescription = document.getElementById('jobDescription');
    elements.bookingDate = document.getElementById('bookingDate');
    elements.bookingTime = document.getElementById('bookingTime');
    elements.mapBtn = document.getElementById('mapBtn');

    // Today's Schedule
    elements.scheduleTitle = document.getElementById('scheduleTitle');
    elements.scheduleDate = document.getElementById('scheduleDate');
    elements.scheduleEmployeeFilter = document.getElementById('scheduleEmployeeFilter');
    elements.scheduleList = document.getElementById('scheduleList');

    // Availability Calendar
    elements.calendarMonth = document.getElementById('calendarMonth');
    elements.calendarGrid = document.getElementById('calendarGrid');
    elements.prevMonth = document.getElementById('prevMonth');
    elements.nextMonth = document.getElementById('nextMonth');

    // Modal
    elements.reportModal = document.getElementById('reportModal');
    elements.modalTitle = document.getElementById('modalTitle');
    elements.closeModal = document.getElementById('closeModal');
    elements.finalizedBanner = document.getElementById('finalizedBanner');
    elements.modalError = document.getElementById('modalError');
    elements.modalEmployee = document.getElementById('modalEmployee');
    elements.modalTime = document.getElementById('modalTime');
    elements.modalAddress = document.getElementById('modalAddress');
    elements.modalPhone = document.getElementById('modalPhone');
    elements.modalJobDescription = document.getElementById('modalJobDescription');
    elements.aiMemoText = document.getElementById('aiMemoText');
    elements.transcribeBtn = document.getElementById('transcribeBtn');
    elements.transcribeBtnText = document.getElementById('transcribeBtnText');
    elements.transcribeSpinner = document.getElementById('transcribeSpinner');
    elements.reportSummary = document.getElementById('reportSummary');
    elements.partsUsed = document.getElementById('partsUsed');
    elements.finalPrice = document.getElementById('finalPrice');
    elements.signatureCanvas = document.getElementById('signatureCanvas');
    elements.clearSignature = document.getElementById('clearSignature');
    elements.signedIndicator = document.getElementById('signedIndicator');
    elements.signatureNote = document.getElementById('signatureNote');
    elements.finalizeBtn = document.getElementById('finalizeBtn');
    elements.finalizedMessage = document.getElementById('finalizedMessage');
}

// --- Firebase Initialization ---
async function initFirebase() {
    try {
        const app = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();

        // Set up auth state listener
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                userId = user.uid;
            } else {
                userId = crypto.randomUUID();
            }
            isAuthReady = true;
            elements.userId.textContent = userId;

            // Start listening to bookings
            setupFirestoreListener();
        });

        // Attempt authentication
        if (initialAuthToken) {
            await auth.signInWithCustomToken(initialAuthToken);
        } else {
            await auth.signInAnonymously();
        }
    } catch (e) {
        console.error("Firebase initialization failed:", e);
        showError("Firebase initialization failed. Check config.");
        hideLoading();
    }
}

// --- Firestore Listener ---
function setupFirestoreListener() {
    if (!db || !userId) return;

    const bookingsRef = db.collection(`artifacts/${appId}/public/data/bookings`);
    const q = bookingsRef.orderBy('timestamp', 'desc');

    unsubscribeFirestore = q.onSnapshot((snapshot) => {
        bookings = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate().getTime(),
        }));

        hideLoading();
        renderCurrentView();
    }, (err) => {
        console.error("Firestore Listener Error:", err);
        showError("Failed to fetch bookings.");
        hideLoading();
    });
}

// --- Navigation ---
function setActiveView(view) {
    currentView = view;

    // Update nav buttons
    elements.navNewBooking.classList.toggle('nav-btn-active', view === 'newBooking');
    elements.navTodaySchedule.classList.toggle('nav-btn-active', view === 'todaySchedule');
    elements.navAvailability.classList.toggle('nav-btn-active', view === 'availabilityCheck');

    elements.navNewBooking.classList.toggle('nav-btn', view !== 'newBooking');
    elements.navTodaySchedule.classList.toggle('nav-btn', view !== 'todaySchedule');
    elements.navAvailability.classList.toggle('nav-btn', view !== 'availabilityCheck');

    // Show/hide views
    elements.newBookingView.classList.toggle('hidden', view !== 'newBooking');
    elements.todayScheduleView.classList.toggle('hidden', view !== 'todaySchedule');
    elements.availabilityView.classList.toggle('hidden', view !== 'availabilityCheck');

    renderCurrentView();
}

function renderCurrentView() {
    if (loading) return;

    switch (currentView) {
        case 'newBooking':
            // Form is already rendered in HTML
            break;
        case 'todaySchedule':
            renderTodaySchedule();
            break;
        case 'availabilityCheck':
            renderCalendar();
            break;
    }
}

// --- Loading/Error Helpers ---
function hideLoading() {
    loading = false;
    elements.loadingIndicator.classList.add('hidden');
}

function showError(message) {
    elements.bookingError.textContent = message;
    elements.bookingError.classList.remove('hidden');
}

function hideError() {
    elements.bookingError.classList.add('hidden');
}

// --- Google Maps Helper ---
function openGoogleMaps(addr) {
    const addressToUse = addr || elements.address.value;
    if (addressToUse.trim()) {
        const encodedAddress = encodeURIComponent(addressToUse);
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
    } else {
        showError("Please enter a valid address.");
    }
}

// --- Price Calculation ---
function calculatePrice(description) {
    const desc = description.toLowerCase();
    let price = 100; // Base call-out fee

    if (desc.includes('faucet') || desc.includes('sink')) {
        price += 75;
    }
    if (desc.includes('toilet') || desc.includes('drain')) {
        price += 100;
    }
    if (desc.includes('pipe') || desc.includes('leaky')) {
        price += 150;
    }
    if (desc.includes('water heater') || desc.includes('boiler')) {
        price += 200;
    }

    // Add a random labor adjustment for realism (0 to $100)
    price += Math.floor(Math.random() * 100);
    return price;
}

// --- CRUD Operations ---
async function handleBookNewJob(e) {
    e.preventDefault();

    if (!db || !userId) {
        showError("Database not ready. Please wait.");
        return;
    }

    const customerName = elements.customerName.value.trim();
    const phoneNumber = elements.phoneNumber.value.trim();
    const address = elements.address.value.trim();
    const jobDescription = elements.jobDescription.value.trim();
    const bookingDate = elements.bookingDate.value;
    const bookingTime = elements.bookingTime.value;
    const employee = elements.employee.value;

    if (!customerName || !phoneNumber || !address || !jobDescription || !bookingDate || !bookingTime || !employee) {
        showError("All fields must be filled out.");
        return;
    }

    const jobDateTime = `${bookingDate}T${bookingTime}`;
    const timestamp = new Date(jobDateTime);

    try {
        const bookingsRef = db.collection(`artifacts/${appId}/public/data/bookings`);
        await bookingsRef.add({
            customerName,
            jobDescription,
            date: bookingDate,
            time: bookingTime,
            employee,
            phoneNumber,
            address,
            userId,
            timestamp: firebase.firestore.Timestamp.fromDate(timestamp),
            status: 'Scheduled',
            reportSummary: '',
            partsUsed: [],
            finalPrice: 0,
            reportFinalized: false,
            signatureData: null,
        });

        // Reset form
        elements.customerName.value = '';
        elements.phoneNumber.value = '';
        elements.address.value = '';
        elements.jobDescription.value = '';
        elements.bookingDate.value = formatDate(new Date());
        elements.bookingTime.value = '09:00';
        elements.employee.value = EMPLOYEES[0].name;
        hideError();

    } catch (e) {
        console.error("Error adding document:", e);
        showError("Failed to create booking.");
    }
}

async function handleUpdateJobStatus(bookingId, newStatus) {
    if (!db) return;
    try {
        const bookingRef = db.collection(`artifacts/${appId}/public/data/bookings`).doc(bookingId);
        await bookingRef.update({ status: newStatus });
    } catch (e) {
        console.error("Error updating document:", e);
        showError("Failed to update booking status.");
    }
}

async function handleDeleteJob(bookingId) {
    if (!db) return;
    try {
        const bookingRef = db.collection(`artifacts/${appId}/public/data/bookings`).doc(bookingId);
        await bookingRef.delete();
    } catch (e) {
        console.error("Error deleting document:", e);
        showError("Failed to delete booking.");
    }
}

// --- Today's Schedule Rendering ---
function renderTodaySchedule() {
    const scheduleDate = elements.scheduleDate.value;
    const employeeFilter = elements.scheduleEmployeeFilter.value;

    // Update title
    const dateObj = new Date(scheduleDate + 'T00:00:00');
    elements.scheduleTitle.textContent = `Schedule for: ${dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

    // Filter bookings
    let filtered = bookings.filter(b => b.date === scheduleDate);

    if (employeeFilter !== 'All') {
        filtered = filtered.filter(b => b.employee === employeeFilter);
    }

    filtered.sort((a, b) => a.time.localeCompare(b.time));

    // Render
    if (filtered.length === 0) {
        elements.scheduleList.innerHTML = '<p class="schedule-empty">No jobs scheduled for this selection.</p>';
        return;
    }

    elements.scheduleList.innerHTML = filtered.map(job => {
        const employee = EmployeeColorMap.get(job.employee);
        const chipClass = employee ? employee.chipClass : '';

        return `
            <div class="job-card" data-job-id="${job.id}">
                <div class="job-card-header">
                    <span class="job-time">${job.time}</span>
                    <div class="job-card-badges">
                        ${job.reportFinalized ? '<span class="badge-finalized">FINALIZED</span>' : ''}
                        <span class="employee-chip ${chipClass}">${job.employee}</span>
                    </div>
                </div>
                <p class="job-customer">${escapeHtml(job.customerName)}</p>
                ${job.phoneNumber ? `<p class="job-detail">Phone: <a href="tel:${escapeHtml(job.phoneNumber)}" class="link" onclick="event.stopPropagation()">${escapeHtml(job.phoneNumber)}</a></p>` : ''}
                ${job.address ? `<p class="job-detail">Address: <span class="address-link link" data-address="${escapeHtml(job.address)}">${escapeHtml(job.address)}<svg xmlns="http://www.w3.org/2000/svg" class="icon-sm" style="display:inline;margin-left:4px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></span></p>` : ''}
                <p class="job-description">${escapeHtml(job.jobDescription)}</p>
                <p class="job-report-status ${job.reportSummary ? 'job-report-status-done' : 'job-report-status-pending'}">
                    Report Status: ${job.reportSummary ? 'Draft/Finalized' : 'Pending Report'}
                </p>
            </div>
        `;
    }).join('');

    // Add click handlers
    elements.scheduleList.querySelectorAll('.job-card').forEach(card => {
        card.addEventListener('click', () => {
            const jobId = card.dataset.jobId;
            const job = bookings.find(b => b.id === jobId);
            if (job) {
                openReportModal(job);
            }
        });
    });

    // Add address link handlers
    elements.scheduleList.querySelectorAll('.address-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            openGoogleMaps(link.dataset.address);
        });
    });
}

// --- Calendar Rendering ---
function renderCalendar() {
    const monthName = currentMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    elements.calendarMonth.textContent = monthName;

    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let html = dayNames.map(day => `<div class="calendar-day-name">${day}</div>`).join('');

    // Leading empty days
    const firstDayOfWeek = startOfMonth.getDay();
    for (let i = 0; i < firstDayOfWeek; i++) {
        html += '<div class="calendar-cell calendar-cell-empty"></div>';
    }

    // Populate days
    const today = formatDate(new Date());
    let date = new Date(startOfMonth);

    while (date <= endOfMonth) {
        const dateStr = formatDate(date);
        const dayBookings = bookings.filter(b => b.date === dateStr);
        const isToday = dateStr === today;

        let bookingsHtml = '';
        if (dayBookings.length > 0) {
            bookingsHtml = '<div class="calendar-bookings">' + dayBookings.map(b => {
                const employee = EmployeeColorMap.get(b.employee);
                const bgClass = employee ? employee.calendarClass : '';
                return `
                    <div class="calendar-booking ${bgClass}" title="${b.employee}: ${b.time} - ${escapeHtml(b.customerName)}">
                        <p class="calendar-booking-time">${b.time}</p>
                        <p class="calendar-booking-employee">${b.employee}</p>
                    </div>
                `;
            }).join('') + '</div>';
        }

        html += `
            <div class="calendar-cell ${isToday ? 'calendar-cell-today' : ''}">
                <span class="calendar-day-number">${date.getDate()}</span>
                ${bookingsHtml}
            </div>
        `;

        date.setDate(date.getDate() + 1);
    }

    elements.calendarGrid.innerHTML = html;
}

function changeMonth(delta) {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + delta);
    currentMonth = newMonth;
    renderCalendar();
}

// --- Modal Functions ---
function openReportModal(job) {
    selectedJobForReport = job;

    // Populate modal
    elements.modalTitle.textContent = `Job Report: ${job.customerName}`;
    elements.modalEmployee.textContent = job.employee;
    elements.modalTime.textContent = `${job.time} on ${job.date}`;
    elements.modalAddress.textContent = job.address;
    elements.modalAddress.onclick = () => openGoogleMaps(job.address);
    elements.modalPhone.textContent = job.phoneNumber;
    elements.modalPhone.href = `tel:${job.phoneNumber}`;
    elements.modalJobDescription.textContent = job.jobDescription;

    elements.reportSummary.value = job.reportSummary || '';
    elements.partsUsed.value = (job.partsUsed || []).join('\n');
    elements.finalPrice.value = job.finalPrice || calculatePrice(job.jobDescription);
    elements.aiMemoText.value = '';

    // Handle finalized state
    const isFinalized = job.reportFinalized;
    elements.finalizedBanner.classList.toggle('hidden', !isFinalized);
    elements.reportSummary.disabled = isFinalized;
    elements.partsUsed.disabled = isFinalized;
    elements.finalPrice.disabled = isFinalized;
    elements.transcribeBtn.disabled = isFinalized;
    elements.clearSignature.classList.toggle('hidden', isFinalized);
    elements.finalizeBtn.classList.toggle('hidden', isFinalized);
    elements.finalizedMessage.classList.toggle('hidden', !isFinalized);

    if (isFinalized && job.signatureData) {
        elements.signatureNote.textContent = `Signature captured on ${new Date(job.timestamp).toLocaleDateString()}.`;
        elements.signatureNote.classList.remove('hidden');
    } else {
        elements.signatureNote.classList.add('hidden');
    }

    elements.modalError.classList.add('hidden');

    // Setup signature canvas
    setupSignatureCanvas(isFinalized);

    // Show modal
    elements.reportModal.classList.remove('hidden');
}

function closeReportModal() {
    elements.reportModal.classList.add('hidden');
    selectedJobForReport = null;
}

function setupSignatureCanvas(isFinalized) {
    const canvas = elements.signatureCanvas;
    signatureCtx = canvas.getContext('2d');

    // Clear canvas
    signatureCtx.clearRect(0, 0, canvas.width, canvas.height);

    // Set drawing properties
    signatureCtx.lineWidth = 3;
    signatureCtx.lineCap = 'round';
    signatureCtx.strokeStyle = '#000000';

    isSigned = false;
    elements.signedIndicator.textContent = '';

    if (isFinalized) {
        canvas.classList.add('signature-canvas-finalized');
        return;
    }

    canvas.classList.remove('signature-canvas-finalized');

    // Remove old listeners by cloning the canvas
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    elements.signatureCanvas = newCanvas;
    signatureCtx = newCanvas.getContext('2d');
    signatureCtx.lineWidth = 3;
    signatureCtx.lineCap = 'round';
    signatureCtx.strokeStyle = '#000000';

    // Add event listeners
    const startDrawing = (e) => {
        e.preventDefault();
        const rect = newCanvas.getBoundingClientRect();
        const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
        const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;

        isDrawing = true;
        signatureCtx.beginPath();
        signatureCtx.moveTo(x, y);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();

        const rect = newCanvas.getBoundingClientRect();
        const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
        const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;

        signatureCtx.lineTo(x, y);
        signatureCtx.stroke();
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        isDrawing = false;
        signatureCtx.closePath();

        // Check if anything was drawn
        const imageData = signatureCtx.getImageData(0, 0, newCanvas.width, newCanvas.height);
        isSigned = imageData.data.some(channel => channel !== 0);
        elements.signedIndicator.textContent = isSigned ? '✅' : '';
        updateFinalizeButton();
    };

    newCanvas.addEventListener('mousedown', startDrawing);
    newCanvas.addEventListener('mousemove', draw);
    newCanvas.addEventListener('mouseup', stopDrawing);
    newCanvas.addEventListener('mouseleave', stopDrawing);

    newCanvas.addEventListener('touchstart', startDrawing);
    newCanvas.addEventListener('touchmove', draw);
    newCanvas.addEventListener('touchend', stopDrawing);
}

function clearSignature() {
    const canvas = elements.signatureCanvas;
    signatureCtx.clearRect(0, 0, canvas.width, canvas.height);
    isSigned = false;
    elements.signedIndicator.textContent = '';
    updateFinalizeButton();
}

function updateFinalizeButton() {
    const hasSummary = elements.reportSummary.value.trim() !== '';
    elements.finalizeBtn.disabled = !isSigned || !hasSummary;
    elements.finalizeBtn.classList.toggle('btn-disabled', !isSigned || !hasSummary);
}

async function handleFinalizeReport() {
    if (!db || !selectedJobForReport || selectedJobForReport.reportFinalized) return;

    const reportSummary = elements.reportSummary.value.trim();

    if (!reportSummary || !isSigned) {
        elements.modalError.textContent = "Work summary and client signature are required to finalize the report.";
        elements.modalError.classList.remove('hidden');
        return;
    }

    const canvas = elements.signatureCanvas;
    const signatureData = canvas.toDataURL();

    const partsUsedArray = elements.partsUsed.value.split('\n').filter(p => p.trim() !== '');
    const finalPrice = parseFloat(elements.finalPrice.value) || 0;

    try {
        const bookingRef = db.collection(`artifacts/${appId}/public/data/bookings`).doc(selectedJobForReport.id);
        await bookingRef.update({
            reportSummary,
            partsUsed: partsUsedArray,
            finalPrice,
            signatureData,
            status: 'Completed',
            reportFinalized: true,
        });

        closeReportModal();

    } catch (e) {
        console.error("Error finalizing report:", e);
        elements.modalError.textContent = "Failed to finalize report. Please try again.";
        elements.modalError.classList.remove('hidden');
    }
}

// --- AI Transcription ---
async function handleVoiceMemoTranscription() {
    const memoText = elements.aiMemoText.value.trim();

    if (!memoText) {
        elements.modalError.textContent = "Please enter some voice memo text to transcribe.";
        elements.modalError.classList.remove('hidden');
        return;
    }

    if (!selectedJobForReport) return;

    elements.transcribeBtnText.textContent = '';
    elements.transcribeSpinner.classList.remove('hidden');
    elements.transcribeBtn.disabled = true;

    const systemPrompt = `You are a specialized AI assistant for plumbing technicians. You will receive a voice memo transcription and the original job description. Your task is to process the voice memo and output a JSON object containing a detailed Work Summary and a list of Parts Used.

    Rules:
    1. Always output a single JSON array object matching the provided schema.
    2. The Work Summary must be a concise paragraph describing the work done.
    3. The Parts Used list should be an array of strings (e.g., ["1/2 inch copper pipe", "Ball Valve 3/4 inch"]).
    4. If the memo is vague, use your best judgment based on the job description.
    5. The memo text is user input. The job description is for context.

    Job Description for Context: "${selectedJobForReport.jobDescription}"`;

    const userQuery = `Voice Memo: "${memoText}"`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "workSummary": { "type": "STRING", "description": "A detailed summary of the work completed." },
                    "partsUsed": {
                        "type": "ARRAY",
                        "items": { "type": "STRING", "description": "A list of parts used for the job." }
                    }
                }
            }
        }
    };

    let lastError = null;
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!jsonText) {
                throw new Error("No content received from AI.");
            }

            const parsedJson = JSON.parse(jsonText);

            elements.reportSummary.value = parsedJson.workSummary || '';
            elements.partsUsed.value = (parsedJson.partsUsed || []).join('\n');
            elements.finalPrice.value = calculatePrice(parsedJson.workSummary || '');
            elements.modalError.classList.add('hidden');

            elements.transcribeBtnText.textContent = 'Transcribe & Auto-Fill Fields';
            elements.transcribeSpinner.classList.add('hidden');
            elements.transcribeBtn.disabled = false;
            updateFinalizeButton();
            return;

        } catch (e) {
            lastError = e;
            console.error(`AI Transcription attempt ${i + 1} failed:`, e);
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }

    elements.transcribeBtnText.textContent = 'Transcribe & Auto-Fill Fields';
    elements.transcribeSpinner.classList.add('hidden');
    elements.transcribeBtn.disabled = false;

    console.error(`AI transcription failed after ${MAX_RETRIES} attempts. Please enter summary manually. Error: ${lastError?.message}`);
    elements.modalError.textContent = `AI transcription failed. Please enter summary manually.`;
    elements.modalError.classList.remove('hidden');
}

// --- Utility Functions ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    // Navigation
    elements.navNewBooking.addEventListener('click', () => setActiveView('newBooking'));
    elements.navTodaySchedule.addEventListener('click', () => setActiveView('todaySchedule'));
    elements.navAvailability.addEventListener('click', () => setActiveView('availabilityCheck'));

    // New Booking Form
    elements.bookingForm.addEventListener('submit', handleBookNewJob);
    elements.mapBtn.addEventListener('click', () => openGoogleMaps());

    // Today's Schedule filters
    elements.scheduleDate.addEventListener('change', renderTodaySchedule);
    elements.scheduleEmployeeFilter.addEventListener('change', renderTodaySchedule);

    // Calendar navigation
    elements.prevMonth.addEventListener('click', () => changeMonth(-1));
    elements.nextMonth.addEventListener('click', () => changeMonth(1));

    // Modal
    elements.reportModal.addEventListener('click', (e) => {
        if (e.target === elements.reportModal) {
            closeReportModal();
        }
    });
    elements.closeModal.addEventListener('click', closeReportModal);
    elements.clearSignature.addEventListener('click', clearSignature);
    elements.finalizeBtn.addEventListener('click', handleFinalizeReport);
    elements.transcribeBtn.addEventListener('click', handleVoiceMemoTranscription);
    elements.reportSummary.addEventListener('input', updateFinalizeButton);
}

// --- Initialize App ---
function init() {
    initElements();
    setupEventListeners();

    // Set default dates
    const today = formatDate(new Date());
    elements.bookingDate.value = today;
    elements.scheduleDate.value = today;

    // Initialize Firebase
    initFirebase();

    // Show initial view
    setActiveView('newBooking');
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
