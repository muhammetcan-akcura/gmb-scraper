import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import http from 'http';
import url from 'url';

const TOKEN_PATH = './token.json';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Create OAuth2 client
 */
function createOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = 'http://localhost:3001/oauth2callback';

    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Get authorization code via local server
 */
function getAuthorizationCode(oAuth2Client) {
    return new Promise((resolve, reject) => {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });

        console.log('\n🔐 Authorization Required');
        console.log('==========================================');
        console.log('Click this URL to sign in:\n');
        console.log(authUrl);
        console.log('\n==========================================');
        console.log('Waiting for authentication...');

        const server = http.createServer(async (req, res) => {
            try {
                if (req.url.startsWith('/oauth2callback')) {
                    const qs = new url.URL(req.url, 'http://localhost:3001').searchParams;
                    const code = qs.get('code');

                    res.end('Authentication successful! You can close this tab and return to the console.');
                    server.close();

                    if (code) {
                        resolve(code);
                    } else {
                        reject(new Error('No code found in redirect from Google'));
                    }
                }
            } catch (e) {
                reject(e);
            }
        });

        server.listen(3001, () => {
            // Server is listening
        });
    });
}

/**
 * Authorize and get OAuth2 client
 */
export async function authorize() {
    const oAuth2Client = createOAuth2Client();

    // Check if we have a saved token
    if (existsSync(TOKEN_PATH)) {
        try {
            const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
            oAuth2Client.setCredentials(token);
            console.log('✅ Using saved authentication token');
            return oAuth2Client;
        } catch (error) {
            console.warn('⚠️ Saved token is invalid, re-authenticating...');
        }
    }

    // Get authorization code via local server
    const code = await getAuthorizationCode(oAuth2Client);

    // Exchange code for token
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Save token for future use
    writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('✅ Token saved to token.json');

    return oAuth2Client;
}
