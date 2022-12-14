import { promises as fsp, createReadStream } from "fs";
import path, { join } from "path";
import { cwd } from "process";
import { createServer } from "http";
import { URL } from "url";
import open from "open";
import destroyer from "server-destroy";
import { google } from "googleapis";
import * as dotenv from "dotenv";

dotenv.config();

const SCOPES = "https://www.googleapis.com/auth/drive";

function isAddressInfo(addr) {
    return addr.port !== undefined;
}
async function authorize() {
    let client;
    if (process.env.CLIENT_ID != null && process.env.CLIENT_SECRET != null) {
        client = new google.auth.OAuth2({
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
        });
    }
    if (process.env.CLIENT_TOKEN != null && process.env.CLIENT_TOKEN != "") {
        client.setCredentials({ refresh_token: process.env.CLIENT_TOKEN });
    } else {
        let _a;
        const redirectUri = new URL(
            (_a = process.env.REDIRECT_URL) !== null && _a !== void 0
                ? _a
                : "http://localhost"
        );
        if (redirectUri.hostname !== "localhost") {
            throw new Error("invalidRedirectUri");
        }
        // create an oAuth client to authorize the API call
        
        client = await new Promise((resolve, reject) => {
            const server = createServer(async (req, res) => {
                try {
                    const url = new URL(req.url, "http://localhost:3000");
                    if (url.pathname !== redirectUri.pathname) {
                        res.end("Invalid callback URL");
                        return;
                    }
                    const searchParams = url.searchParams;
                    if (searchParams.has("error")) {
                        res.end("Authorization rejected.");
                        reject(new Error(searchParams.get("error")));
                        return;
                    }
                    if (!searchParams.has("code")) {
                        res.end("No authentication code provided.");
                        reject(new Error("Cannot read authentication code."));
                        return;
                    }
                    const code = searchParams.get("code");
                    const { tokens } = await client.getToken({
                        code: code,
                        redirect_uri: redirectUri.toString(),
                    });
                    client.credentials = tokens;
                    resolve(client);
                    res.end(
                        `Authentication successful! Please return to the console\n
                        ${client.credentials.refresh_token}
                        `
                    );
                } catch (e) {
                    reject(e);
                } finally {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    server.destroy();
                }
            });
            let listenPort = 0;
            if (redirectUri.port !== "") {
                listenPort = Number(redirectUri.port);
            }
            server.listen(listenPort, () => {
                const address = server.address();
                if (isAddressInfo(address)) {
                    redirectUri.port = String(address.port);
                }
                // open the browser to the authorize url to start the workflow
                const authorizeUrl = client.generateAuthUrl({
                    redirect_uri: redirectUri.toString(),
                    access_type: "offline",
                    scope: SCOPES,
                });
                open(authorizeUrl, { wait: false }).then((cp) => cp.unref());
            });
            destroyer(server);
        });
    }
    return client;
}

async function upload(authClient) {
    const drive = google.drive({ version: "v3", auth: authClient });
    const media = {
        body: createReadStream(fileName),
    };
    try {
        const file = await drive.files.create({
            requestBody: {
                name: fileName,
            },
            media: media,

            fields: "id",
        });
        console.log("File Id:", file.data.id);
        return file.data.id;
    } catch (err) {
        // TODO(developer) - Handle error
        throw err;
    }
}

let fileName = "photo.jpg";
authorize().then(upload).catch(console.error);
