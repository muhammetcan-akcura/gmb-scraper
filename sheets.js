import { google } from 'googleapis';

/**
 * Create a new sheet tab with dynamic name
 * @param {OAuth2Client} auth - Authorized OAuth2 client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @param {string} sheetTitle - Title for the new sheet
 * @returns {Promise<string>} - Sheet ID
 */
export async function createSheet(auth, spreadsheetId, sheetTitle) {
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        const response = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: sheetTitle,
                            },
                        },
                    },
                ],
            },
        });

        const sheetId = response.data.replies[0].addSheet.properties.sheetId;
        console.log(`✅ Created new sheet: "${sheetTitle}"`);
        return sheetId;
    } catch (error) {
        if (error.message.includes('already exists')) {
            console.log(`⚠️ Sheet "${sheetTitle}" already exists, using existing sheet`);
            // Get existing sheet ID
            const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
            const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetTitle);
            return sheet.properties.sheetId;
        }
        throw error;
    }
}

/**
 * Write data to Google Sheet
 * @param {OAuth2Client} auth - Authorized OAuth2 client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @param {string} sheetTitle - Sheet title to write to
 * @param {Array} businesses - Array of business objects
 */
export async function writeToSheet(auth, spreadsheetId, sheetTitle, businesses) {
    const sheets = google.sheets({ version: 'v4', auth });

    // Prepare headers
    const headers = [
        'Business Name',
        'Phone Number',
        'Website',
        'Rating',
        'Review Count',
        'Address',
        'Google Maps URL',
        'Keyword',
        'Location',
        'Date',
    ];

    // Prepare data rows
    const rows = businesses.map(business => [
        business.name,
        business.phone,
        business.website,
        business.rating,
        business.reviewCount,
        business.address,
        business.mapsUrl,
        business.keyword,
        business.location,
        business.date,
    ]);

    // Combine headers and data
    const values = [headers, ...rows];

    // Write to sheet
    const response = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetTitle}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
            values,
        },
    });

    console.log(`✅ Wrote ${rows.length} businesses to "${sheetTitle}"`);
    console.log(`📊 Range: ${response.data.updatedRange}`);

    return response.data;
}

/**
 * Generate dynamic sheet title
 * @param {string} keyword - Search keyword
 * @param {string} location - Search location
 * @returns {string} - Sheet title
 */
export function generateSheetTitle(keyword, location) {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const sanitizedKeyword = keyword.replace(/[^\w\s]/g, '').slice(0, 20);
    const sanitizedLocation = location.replace(/[^\w\s]/g, '').slice(0, 20);

    return `${sanitizedKeyword} - ${sanitizedLocation} - ${timestamp}`;
}
