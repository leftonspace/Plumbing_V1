const functions = require('firebase-functions');
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');
const twilio = require('twilio');

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

// Twilio Configuration - Set these in Firebase environment config
// firebase functions:config:set twilio.sid="YOUR_SID" twilio.token="YOUR_TOKEN" twilio.phone="YOUR_PHONE"
const twilioConfig = functions.config().twilio || {};

/**
 * Cloud Function: onReportFinalized
 * Triggers when a booking document is updated with reportFinalized = true
 * 1. Generates a PDF receipt
 * 2. Uploads PDF to Firebase Storage
 * 3. Sends SMS to client with PDF link
 */
exports.onReportFinalized = functions.firestore
    .document('artifacts/{appId}/public/data/bookings/{bookingId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const bookingId = context.params.bookingId;
        const appId = context.params.appId;

        // Only proceed if report was just finalized (wasn't finalized before, is now)
        if (before.reportFinalized || !after.reportFinalized) {
            console.log('Report not newly finalized, skipping...');
            return null;
        }

        console.log(`Processing finalized report for booking: ${bookingId}`);

        try {
            // 1. Generate PDF
            const pdfBuffer = await generatePDF(after);

            // 2. Upload PDF to Firebase Storage
            const pdfUrl = await uploadPDF(pdfBuffer, appId, bookingId);

            // 3. Send SMS to client
            await sendSMS(after, pdfUrl);

            // 4. Update document with PDF URL
            await change.after.ref.update({
                pdfUrl: pdfUrl,
                smsSentAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Successfully processed report for booking: ${bookingId}`);
            return { success: true, bookingId, pdfUrl };

        } catch (error) {
            console.error('Error processing report:', error);

            // Update document with error status
            await change.after.ref.update({
                smsError: error.message,
                smsErrorAt: admin.firestore.FieldValue.serverTimestamp()
            });

            throw error;
        }
    });

/**
 * Generate PDF receipt from booking data
 */
async function generatePDF(booking) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'LETTER',
                margin: 50
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Header
            doc.fontSize(24)
               .font('Helvetica-Bold')
               .text('Plumbing Service Receipt', { align: 'center' });

            doc.moveDown(0.5);
            doc.fontSize(12)
               .font('Helvetica')
               .fillColor('#666666')
               .text('Thank you for choosing our services!', { align: 'center' });

            doc.moveDown(1.5);

            // Horizontal line
            doc.strokeColor('#2563eb')
               .lineWidth(2)
               .moveTo(50, doc.y)
               .lineTo(562, doc.y)
               .stroke();

            doc.moveDown(1);

            // Customer Information Section
            doc.fillColor('#000000')
               .fontSize(14)
               .font('Helvetica-Bold')
               .text('Customer Information');

            doc.moveDown(0.5);
            doc.fontSize(11)
               .font('Helvetica');

            const customerInfo = [
                ['Name:', booking.customerName],
                ['Phone:', booking.phoneNumber],
                ['Address:', booking.address],
            ];

            customerInfo.forEach(([label, value]) => {
                doc.font('Helvetica-Bold').text(label, { continued: true });
                doc.font('Helvetica').text(` ${value || 'N/A'}`);
            });

            doc.moveDown(1);

            // Job Details Section
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .text('Job Details');

            doc.moveDown(0.5);
            doc.fontSize(11)
               .font('Helvetica');

            const jobDetails = [
                ['Date:', booking.date],
                ['Time:', booking.time],
                ['Technician:', booking.employee],
                ['Status:', booking.status],
            ];

            jobDetails.forEach(([label, value]) => {
                doc.font('Helvetica-Bold').text(label, { continued: true });
                doc.font('Helvetica').text(` ${value || 'N/A'}`);
            });

            doc.moveDown(0.5);
            doc.font('Helvetica-Bold').text('Original Request:');
            doc.font('Helvetica').text(booking.jobDescription || 'N/A');

            doc.moveDown(1);

            // Work Summary Section
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .text('Work Completed');

            doc.moveDown(0.5);
            doc.fontSize(11)
               .font('Helvetica')
               .text(booking.reportSummary || 'No summary provided.');

            doc.moveDown(1);

            // Parts Used Section
            if (booking.partsUsed && booking.partsUsed.length > 0) {
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .text('Parts Used');

                doc.moveDown(0.5);
                doc.fontSize(11)
                   .font('Helvetica');

                booking.partsUsed.forEach((part, index) => {
                    doc.text(`• ${part}`);
                });

                doc.moveDown(1);
            }

            // Price Section
            doc.moveDown(0.5);
            doc.strokeColor('#22c55e')
               .lineWidth(1)
               .moveTo(50, doc.y)
               .lineTo(562, doc.y)
               .stroke();

            doc.moveDown(0.5);
            doc.fontSize(18)
               .font('Helvetica-Bold')
               .fillColor('#22c55e')
               .text(`Total: $${(booking.finalPrice || 0).toFixed(2)}`, { align: 'right' });

            doc.moveDown(1.5);

            // Signature Section
            doc.fillColor('#000000')
               .fontSize(12)
               .font('Helvetica-Bold')
               .text('Customer Signature:', { align: 'left' });

            if (booking.signatureData) {
                doc.moveDown(0.5);
                // Add signature image from base64
                try {
                    const signatureBuffer = Buffer.from(
                        booking.signatureData.replace(/^data:image\/\w+;base64,/, ''),
                        'base64'
                    );
                    doc.image(signatureBuffer, {
                        width: 200,
                        height: 50
                    });
                } catch (sigError) {
                    console.error('Error adding signature to PDF:', sigError);
                    doc.fontSize(10)
                       .font('Helvetica-Oblique')
                       .text('[Signature on file]');
                }
            }

            doc.moveDown(2);

            // Footer
            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#999999')
               .text('This receipt was automatically generated upon job completion.', { align: 'center' });

            doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });

            // Finalize PDF
            doc.end();

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Upload PDF to Firebase Storage
 */
async function uploadPDF(pdfBuffer, appId, bookingId) {
    const bucket = storage.bucket();
    const filename = `receipts/${appId}/${bookingId}_${Date.now()}.pdf`;
    const file = bucket.file(filename);

    await file.save(pdfBuffer, {
        metadata: {
            contentType: 'application/pdf',
            metadata: {
                bookingId: bookingId
            }
        }
    });

    // Make file publicly accessible and get URL
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

    return publicUrl;
}

/**
 * Send SMS to client via Twilio
 */
async function sendSMS(booking, pdfUrl) {
    if (!twilioConfig.sid || !twilioConfig.token || !twilioConfig.phone) {
        console.warn('Twilio not configured. Skipping SMS.');
        console.log('To configure: firebase functions:config:set twilio.sid="X" twilio.token="X" twilio.phone="X"');
        return { skipped: true, reason: 'Twilio not configured' };
    }

    const client = twilio(twilioConfig.sid, twilioConfig.token);

    const message = `Hi ${booking.customerName}! Your plumbing service is complete.

Technician: ${booking.employee}
Total: $${(booking.finalPrice || 0).toFixed(2)}

View your receipt: ${pdfUrl}

Thank you for your business!
- Plumbing Dispatch Hub`;

    const result = await client.messages.create({
        body: message,
        from: twilioConfig.phone,
        to: booking.phoneNumber
    });

    console.log(`SMS sent successfully. SID: ${result.sid}`);
    return { success: true, messageSid: result.sid };
}

/**
 * HTTP Function: Manual trigger for testing
 * Call this to manually send a receipt for a specific booking
 */
exports.sendReceiptManually = functions.https.onRequest(async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { appId, bookingId } = req.body;

    if (!appId || !bookingId) {
        res.status(400).json({ error: 'Missing appId or bookingId' });
        return;
    }

    try {
        const docRef = db.doc(`artifacts/${appId}/public/data/bookings/${bookingId}`);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Booking not found' });
            return;
        }

        const booking = doc.data();

        if (!booking.reportFinalized) {
            res.status(400).json({ error: 'Report not finalized yet' });
            return;
        }

        // Generate and send
        const pdfBuffer = await generatePDF(booking);
        const pdfUrl = await uploadPDF(pdfBuffer, appId, bookingId);
        const smsResult = await sendSMS(booking, pdfUrl);

        // Update document
        await docRef.update({
            pdfUrl: pdfUrl,
            smsSentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            success: true,
            pdfUrl,
            smsResult,
            message: 'Receipt generated and SMS sent successfully'
        });

    } catch (error) {
        console.error('Error in manual send:', error);
        res.status(500).json({ error: error.message });
    }
});
