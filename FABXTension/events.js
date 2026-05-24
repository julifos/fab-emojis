"use strict";

const t = (key, fallback) => chrome.i18n.getMessage(key) || fallback;

const FORO_DOMAIN = "armasblancas.mforos.com";
const FORO_URL_PATTERNS = [
    "http://armasblancas.mforos.com/*",
    "https://armasblancas.mforos.com/*"
];

const MENU_ROOT_ID = "fab-root";
const MENU_SEARCH_FAB_ID = "fab-search-forum";
const MENU_SEARCH_GOOGLE_ID = "fab-search-google";

let imgbbAuthTokenCache = null;

const encodeLatin1Query = (text) => {
    const unreserved = /^[A-Za-z0-9\-_.~]$/;
    let out = "";

    for (const ch of text) {
        if (ch === " ") {
            out += "+";
            continue;
        }

        if (unreserved.test(ch)) {
            out += ch;
            continue;
        }

        const code = ch.charCodeAt(0);
        if (code <= 0xFF) {
            out += `%${code.toString(16).toUpperCase().padStart(2, "0")}`;
        } else {
            out += encodeURIComponent(ch);
        }
    }

    return out;
};

// 1. Crear el árbol de menús al instalar/actualizar la extensión
if (chrome.contextMenus && chrome.contextMenus.create) {
    chrome.runtime.onInstalled.addListener(function() {
        chrome.contextMenus.create({
            id: MENU_ROOT_ID,
            title: t("contextRootTitle", "FAB"),
            contexts: ["selection"],
            documentUrlPatterns: FORO_URL_PATTERNS
        });

        chrome.contextMenus.create({
            id: MENU_SEARCH_FAB_ID,
            parentId: MENU_ROOT_ID,
            title: t("contextSearchFab", "Buscar en el FAB"),
            contexts: ["selection"],
            documentUrlPatterns: FORO_URL_PATTERNS
        });

        chrome.contextMenus.create({
            id: MENU_SEARCH_GOOGLE_ID,
            parentId: MENU_ROOT_ID,
            title: t("contextSearchFabGoogle", "Buscar en el FAB con Google"),
            contexts: ["selection"],
            documentUrlPatterns: FORO_URL_PATTERNS
        });
    });
}

// 2. Gestionar la selección del usuario en el menú
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener(function(info, tab) {
        if (!tab || !tab.url || !tab.url.includes(FORO_DOMAIN)) return;

        const selectedText = (info.selectionText || "").trim();
        if (!selectedText) return;

        if (info.menuItemId === MENU_SEARCH_FAB_ID) {
            const query = encodeLatin1Query(selectedText);
            const url = `https://armasblancas.mforos.com/search/?q=${query}`;
            chrome.tabs.create({ url });
            return;
        }

        if (info.menuItemId === MENU_SEARCH_GOOGLE_ID) {
            const query = encodeURIComponent(`${selectedText} site:armasblancas.mforos.com`);
            const url = `https://www.google.com/search?q=${query}`;
            chrome.tabs.create({ url });
        }
    });
}

// 3. Inyectar el CSS de forma proactiva al cargar la página
// Escuchamos cuando una pestaña cambia de estado (comienza a cargar el DOM)
if (chrome.tabs && chrome.tabs.onUpdated && chrome.scripting) {
    chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
        if (changeInfo.status === "loading" && tab.url && tab.url.includes(FORO_DOMAIN)) {

            chrome.storage.local.get({ temaActivo: "defecto" }, function(data) {
                if (data.temaActivo === "defecto") return;

                let cssFile = "";
                let jsFile = "";
                // IMPORTANTE: Aseguramos la barra diagonal '/' al inicio para que la ruta sea absoluta dentro del paquete
                if (data.temaActivo === "marfil") cssFile = "/themes/marfil.css";
                if (data.temaActivo === "camuflaje") cssFile = "/themes/camuflaje.css";
                if (data.temaActivo === "first-blood") {
                    cssFile = "/themes/first-blood.css";
                    jsFile = "/themes/first-blood.js";
                }

                if (cssFile) {
                    chrome.scripting.insertCSS({
                        target: { tabId: tabId, allFrames: true },
                        files: [cssFile]
                    }).then(() => {
                        console.log(`[FAB] CSS ${cssFile} inyectado con éxito en pestaña ${tabId}`);
                    }).catch(err => {
                        console.error("[FAB] Error crítico inyectando CSS:", err);
                    });
                }

                if (jsFile) {
                    chrome.scripting.executeScript({
                        target: { tabId: tabId, allFrames: true },
                        files: [jsFile]
                    }).then(() => {
                        console.log(`[FAB] JS ${jsFile} inyectado con éxito en pestaña ${tabId}`);
                    }).catch(err => {
                        console.error("[FAB] Error crítico inyectando JS:", err);
                    });
                }
            });
        }
    });
}

const blobFromDataUrl = (dataUrl, mimeTypeFallback = "application/octet-stream") => {
    const parts = String(dataUrl || "").split(",");
    if (parts.length < 2) {
        throw new Error("Formato de imagen invalido");
    }

    const header = parts[0];
    const base64 = parts[1];
    const mimeMatch = header.match(/data:([^;]+);base64/i);
    const mime = mimeMatch && mimeMatch[1] ? mimeMatch[1] : mimeTypeFallback;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
};

const getImgbbAuthToken = async () => {
    if (imgbbAuthTokenCache) return imgbbAuthTokenCache;

    const response = await fetch("https://imgbb.com/");
    const html = await response.text();
    const match = html.match(/auth_token\s*=\s*"([^"]+)"/i)
        || html.match(/auth_token\s*:\s*"([^"]+)"/i)
        || html.match(/"auth_token"\s*:\s*"([^"]+)"/i);

    if (!match || !match[1]) {
        throw new Error("No se pudo obtener token de ImgBB");
    }

    imgbbAuthTokenCache = match[1];
    return imgbbAuthTokenCache;
};

const resolvePostimagesDirectUrl = async (pageUrl) => {
    if (pageUrl.includes("i.postimg.cc/")) return pageUrl;

    const response = await fetch(pageUrl);
    const html = await response.text();

    const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (og && og[1]) return og[1];

    const any = html.match(/https:\/\/i\.postimg\.cc[^"'\s<]+/i);
    return any ? any[0].replace(/\\\//g, "/") : null;
};

const uploadToImgbb = async (filePayload) => {
    const authToken = await getImgbbAuthToken();
    const formData = new FormData();
    const blob = blobFromDataUrl(filePayload.dataUrl, filePayload.type || "image/png");

    formData.append("source", blob, filePayload.name || "image.png");
    formData.append("type", "file");
    formData.append("action", "upload");
    formData.append("auth_token", authToken);

    const response = await fetch("https://imgbb.com/json", {
        method: "POST",
        headers: {
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01"
        },
        body: formData
    });

    const data = await response.json();
    const url = data?.image?.url || data?.image?.display_url || data?.success?.image?.url;
    if (!url) {
        throw new Error(data?.error?.message || "Subida rechazada por ImgBB");
    }

    return url;
};

const uploadToPostimages = async (filePayload) => {
    const formData = new FormData();
    const blob = blobFromDataUrl(filePayload.dataUrl, filePayload.type || "image/png");

    formData.append("gallery", "");
    formData.append("numfiles", "1");
    formData.append("upload_session", `${Date.now()}${Math.random().toString().substring(1)}`);
    formData.append("file", blob, filePayload.name || "image.png");

    const response = await fetch("https://postimages.org/json", {
        method: "POST",
        body: formData
    });

    const data = await response.json();
    const pageUrl = data?.image || data?.url;
    if (!pageUrl) {
        throw new Error("Postimages no devolvio URL");
    }

    const direct = await resolvePostimagesDirectUrl(pageUrl);
    if (!direct) {
        throw new Error("No se pudo resolver URL directa en Postimages");
    }

    return direct;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.action !== "fabUploadImages") return;

    (async () => {
        const provider = message.provider === "postimages" ? "postimages" : "imgbb";
        const files = Array.isArray(message.files) ? message.files : [];
        if (files.length === 0) {
            throw new Error("No hay imagenes para subir");
        }

        const urls = [];
        for (const f of files) {
            if (provider === "postimages") {
                urls.push(await uploadToPostimages(f));
            } else {
                urls.push(await uploadToImgbb(f));
            }
        }

        sendResponse({ success: true, urls });
    })().catch((err) => {
        sendResponse({ success: false, error: err?.message || String(err) });
    });

    return true;
});