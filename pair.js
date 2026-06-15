import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';

const router = express.Router();
export const fakeQuoted = {
  key: {
    fromMe: false,
    participant: "0@s.whatsapp.net",
    remoteJid: "status@broadcast"
  },
  message: {
    contactMessage: {
      displayName: "𝑆𝐿𝐼𝑀𝐸 𝑇𝐸𝐶𝐻 𝐸𝑀𝑃𝐼𝑅𝐸",
      vcard: `BEGIN:VCARD
VERSION:3.0
N:WhatsApp;Business;;;
FN:WhatsApp Business
ORG:Meta;
TEL;type=CELL;type=VOICE;waid=22606527293:+22606527293
END:VCARD`
    }
  }
};

// Ensure the session directory exists
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session`);

    // Remove existing session if present
    await removeFile(dirs);

    // Clean the phone number - remove any non-digit characters
    num = num.replace(/[^0-9]/g, '');

    // Validate the phone number using awesome-phonenumber
    const phone = pn('+' + num);
    if (!phone.isValid()) {
        if (!res.headersSent) {
            return res.status(400).send({ code: 'Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, 84987654321 for Vietnam, etc.) without + or spaces.' });
        }
        return;
    }
    // Use the international number format (E.164, without '+')
    num = phone.getNumber('e164').replace('+', '');

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            let DemonKing = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.windows('Chrome'),
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 5,
            });

            DemonKing.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin, isOnline } = update;

                if (connection === 'open') {
                    console.log("✅ Connected successfully!");
                    console.log("📱 Sending session file to user...");
                    
                    try {
                        const sessionDemon = fs.readFileSync(dirs + '/creds.json');

                        // Send session file to user
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                        await DemonKing.sendMessage(userJid, {
                            document: sessionDemon,
                            mimetype: 'application/json',
                            fileName: 'creds.json'
                        },
                        {
                        quoted: fakeQuoted }
                        );
                        console.log("📄 Session file sent successfully");

                        // Send video thumbnail with caption
                        await DemonKing.sendMessage(userJid, {
                            image: { url: 'https://files.catbox.moe/3csd6z.png' },
                            caption: `╔━═━═━═━═━═━═━═━═━═━═━═━═❑\n┃*🇭🇰⃟🇦🇱* 𓊈 DEMON KING MD 𓊉 *🇭🇰⃟🇦🇱*\n╚━═━═━═━═━═━═━═━═━═━═━═━═❒`
                        },
                        {
                        quoted: fakeQuoted }
                        );
                        console.log("🎬 Channels Supports send");

                        // Send warning message
                        await DemonKing.sendMessage(userJid, {
                            text: `✢ *_𝑆𝐴𝐿𝑈𝑇 𝑁𝑂𝑈𝑉𝐸𝐿 𝑈𝑇𝐼𝐿𝐼𝑆𝐴𝑇𝐸𝑈𝑅, 𝑀𝐸𝑅𝐶𝐼 𝐷'𝐴𝑉𝑂𝐼𝑅 𝐶𝐻𝑂𝐼𝑆𝐼 "𝑇𝐻𝐸 𝐷𝐸𝑀𝑂𝑁 𝐾𝐼𝑁𝐺 𝑀𝐷" 𝑈𝑁 𝐵𝑂𝑇 𝑊𝐻𝐴𝑇𝑆𝐴𝑃𝑃 𝑃𝐴𝑅 "𝑇𝐻𝐸 𝑆𝐿𝐼𝑀𝐸 𝑇𝐸𝐶𝐻 𝐸𝑀𝑃𝐼𝑅𝐸" 𝐿𝐸 𝐵𝑂𝑇 𝐸𝑆𝑇 𝐶𝑂𝑁𝑁𝐸𝐶𝑇𝐸↗️✅ 𝐼𝐿 𝑅𝐸𝑆𝑇𝐸 𝑀𝐴𝐼𝑁𝑇𝐸𝑁𝐴𝑁𝑇 𝐴 𝐷𝐸𝑃𝐿𝑂𝑌É 𝑆𝑈𝑅 𝑇𝑂𝑁 𝑆𝐸𝑅𝑉𝐸𝑈𝑅/𝑃𝐴𝑁𝐸𝐿 𝐴𝑉𝐸𝐶 𝑇𝐴 𝑆𝐸𝑆𝑆𝐼𝑂𝑁 𝐼𝐷 𝑂𝑈 𝑇𝑂𝑁 𝐹𝐼𝐶𝐻𝐼𝐸𝑅 𝐶𝑅𝐸𝐷𝑆.𝐽𝑆𝑂𝑁_*\n\n*_𝑺𝑼𝑰𝑻 𝑳𝑬𝑺 𝑺𝑼𝑷𝑷𝑶𝑹𝑻𝑺 𝑺𝑼𝑹:_*\n*_🔰𝐆𝐢𝐓𝐇𝐔𝐁:_* https://github.com/kinglucifero456-glitch\n*_🔰𝐘𝐎𝐔𝐓𝐔𝐁𝐄:_* https://youtu.be/zQg7dk_YDM8\n*_🔰𝐓𝐄𝐋𝐄𝐆𝐑𝐀𝐌:_* https://t.me/TheBlackKingLuciferoChannel\n> *_𝄞⃠𝑆𝐼𝐺𝑁𝐸𝐷 𝐵𝑌 𝐵𝐿𝐴𝐶𝐾 𝐾𝐼𝑁𝐺 𝐿𝑈𝐶𝐼𝐹𝐸𝑅𝑂𝄞⃠_*`
                        },
                        {
                        quoted: fakeQuoted }
                        );
                        console.log("⚠️ Warning message sent successfully");

                        // Clean up session after use
                        console.log("🧹 Cleaning up session...");
                        await delay(1000);
                        removeFile(dirs);
                        console.log("✅ Session cleaned up successfully");
                        console.log("🎉 Process completed successfully!");
                        // Do not exit the process, just finish gracefully
                    } catch (error) {
                        console.error("❌ Error sending messages:", error);
                        // Still clean up session even if sending fails
                        removeFile(dirs);
                        // Do not exit the process, just finish gracefully
                    }
                }

                if (isNewLogin) {
                    console.log("🔐 New login via pair code");
                }

                if (isOnline) {
                    console.log("📶 Client is online");
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;

                    if (statusCode === 401) {
                        console.log("❌ Logged out from WhatsApp. Need to generate new pair code.");
                    } else {
                        console.log("🔁 Connection closed — restarting...");
                        initiateSession();
                    }
                }
            });

            if (!DemonKing.authState.creds.registered) {
                await delay(3000); // Wait 3 seconds before requesting pairing code
                num = num.replace(/[^\d+]/g, '');
                if (num.startsWith('+')) num = num.substring(1);

                try {
                    let code = await DemonKing.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    if (!res.headersSent) {
                        console.log({ num, code });
                        await res.send({ code });
                    }
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
                    if (!res.headersSent) {
                        res.status(503).send({ code: 'Failed to get pairing code. Please check your phone number and try again.' });
                    }
                }
            }

            DemonKing.ev.on('creds.update', saveCreds);
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    if (e.includes("conflict")) return;
    if (e.includes("not-authorized")) return;
    if (e.includes("Socket connection timeout")) return;
    if (e.includes("rate-overlimit")) return;
    if (e.includes("Connection Closed")) return;
    if (e.includes("Timed Out")) return;
    if (e.includes("Value not found")) return;
    if (e.includes("Stream Errored")) return;
    if (e.includes("Stream Errored (restart required)")) return;
    if (e.includes("statusCode: 515")) return;
    if (e.includes("statusCode: 503")) return;
    console.log('Caught exception: ', err);
});

export default router;