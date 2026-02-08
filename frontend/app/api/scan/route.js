import { spawn } from 'child_process';
import path from 'path';

// Force dynamic to prevent static optimization issues
export const dynamic = 'force-dynamic';

export async function POST(req) {
    try {
        const { keyword, location } = await req.json();

        if (!keyword || !location) {
            return new Response('Missing keyword or location', { status: 400 });
        }

        // Function to generate path at runtime to bypass static analysis
        const getScriptPath = () => {
            // Use variables to break static analysis
            const parts = ['..', 'index.js'];
            return path.resolve(process.cwd(), ...parts);
        };

        const scriptPath = getScriptPath();
        const spawnCwd = path.resolve(process.cwd(), '..');

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            start(controller) {
                // Spawn the Node.js process
                const child = spawn('node', [scriptPath, keyword, location], {
                    cwd: spawnCwd,
                    env: { ...process.env },
                });

                const sendLog = (text) => {
                    controller.enqueue(encoder.encode(text));
                };

                child.stdout.on('data', (data) => {
                    sendLog(data.toString());
                });

                child.stderr.on('data', (data) => {
                    sendLog(`ERROR: ${data.toString()}`);
                });

                child.on('close', (code) => {
                    sendLog(`\n[Process exited with code ${code}]`);
                    controller.close();
                });

                child.on('error', (err) => {
                    sendLog(`\n[Spawn Error: ${err.message}]`);
                    controller.close();
                });
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
