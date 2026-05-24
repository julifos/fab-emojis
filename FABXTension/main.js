/**
 * FABXTension - Core Content Script Module
 */
const t = (key, fallback) => {
    try {
        return chrome.i18n.getMessage(key) || fallback;
    } catch (e) {
        return fallback;
    }
};

const FABXTension = {
    // Configuración y estados globales del script
    config: {
		debug: true,
        foroDomain: "armasblancas.mforos.com"
    },

    /**
     * Punto de entrada principal
     */
	init: function() {
        const hrf = window.location.href;
        
        // Filtro de seguridad: si no estamos en el subdominio del FAB, abortar inmediatamente
        if (!hrf.includes(this.config.foroDomain)) return;
        
        this.log("Inicializando módulos activos...");

        // Boton de compartir en la cabecera de temas (antes de "Responder").
        this.initShareButton();

        // Fallback cross-browser: aplica el CSS del tema desde content script si el background no inyecta.
        this.applyStoredThemeOnPageLoad();

        // Integración del selector dentro del menú nativo del foro.
        this.initThemeMenuInFab();
        
        // 1. Enrutador de URLs (Switch modular)
        this.router(hrf);
        
        // 2. Inicializar detector de imágenes sin enlace
        this.initImageInteractivity();
    },

	initShareButton: function() {
        const mount = () => this.mountShareButton();
        mount();

        if (!document.body.dataset.fabxShareRetryHook) {
            document.body.dataset.fabxShareRetryHook = '1';
            let retries = 0;
            const intervalId = setInterval(() => {
                retries += 1;
                mount();
                if (retries >= 50) clearInterval(intervalId);
            }, 200);
        }
    },

	mountShareButton: function() {
        if (document.getElementById('fab-share-button')) return true;

        const toTop = document.getElementById('to-the-top');
        if (!toTop) return false;

        const linksContainer = toTop.querySelector('.alignRight .linksContainerOne');
        if (!linksContainer) return false;

        const responderBtn = linksContainer.querySelector('a.tabla_boton.largeButton');
        if (!responderBtn) return false;

        const wrapper = document.createElement('div');
        wrapper.id = 'fab-share-wrapper';
        Object.assign(wrapper.style, {
            position: 'relative',
            display: 'inline-block',
            marginRight: '6px'
        });

        const shareBtn = document.createElement('a');
        shareBtn.id = 'fab-share-button';
        shareBtn.href = 'javascript:;';
        shareBtn.title = t('shareButtonTitle', 'Compartir este hilo');
        shareBtn.className = 'tabla_boton largeButton';
        shareBtn.innerHTML = '<span class="fab-share-main-icon" aria-hidden="true"></span>';
        Object.assign(shareBtn.style, {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
        });

        const shareMainIcon = shareBtn.querySelector('.fab-share-main-icon');
        Object.assign(shareMainIcon.style, {
            display: 'inline-block',
            height: '26px',
            width: '26px',
            maxHeight: '26px',
            backgroundImage: `url("${chrome.runtime.getURL('res/social-icons/share-white.png')}")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: 'contain'
        });

        const menu = document.createElement('div');
        menu.id = 'fab-share-menu';
        Object.assign(menu.style, {
            position: 'absolute',
            right: '0',
            top: 'calc(100% + 6px)',
            minWidth: '40px',
            background: '#fff',
            border: '1px solid #bbb',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            padding: '6px',
            zIndex: '200000',
            display: 'none'
        });

        const pageUrl = window.location.href;
        const pageTitle = (document.title || '').trim();
        const encodedUrl = encodeURIComponent(pageUrl);
        const encodedText = encodeURIComponent(pageTitle ? `${pageTitle} ${pageUrl}` : pageUrl);

        const items = [
            {
	            title: t('shareFacebookTitle', 'Facebook'),
                icon: 'facebook.png',
                url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
            },
            {
	            title: t('shareXTitle', 'X'),
                icon: 'x.png',
                url: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(pageTitle)}`
            },
            {
	            title: t('shareWhatsAppTitle', 'WhatsApp'),
                icon: 'whatsapp.png',
                url: `https://wa.me/?text=${encodedText}`
            }
        ];

        items.forEach((item) => {
            const link = document.createElement('a');
            link.href = item.url;
            link.title = `${t('shareOnPrefix', 'Compartir en')} ${item.title}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            Object.assign(link.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '4px',
                textDecoration: 'none',
                color: '#000'
            });

            const icon = document.createElement('img');
            icon.src = chrome.runtime.getURL(`res/social-icons/${item.icon}`);
            icon.alt = '';
            Object.assign(icon.style, {
                maxHeight: '26px',
                width: 'auto',
                flexShrink: '0'
            });


            link.appendChild(icon);

            link.addEventListener('mouseenter', () => {
                link.style.backgroundColor = '#f1f1f1';
            });
            link.addEventListener('mouseleave', () => {
                link.style.backgroundColor = 'transparent';
            });
            menu.appendChild(link);
        });

        shareBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        });

        menu.addEventListener('click', (e) => e.stopPropagation());

        document.addEventListener('click', () => {
            menu.style.display = 'none';
        });

        wrapper.appendChild(shareBtn);
        wrapper.appendChild(menu);
        linksContainer.insertBefore(wrapper, responderBtn);

        return true;
    },

    /**
     * Aplica el tema guardado al documento principal.
     * Esto cubre navegadores/entornos donde la inyección desde background falle.
     */
	applyStoredThemeOnPageLoad: function() {
        const linkId = 'fab-css-page-tema';

        chrome.storage.local.get({ temaActivo: 'defecto' }, (data) => {
            const tema = data.temaActivo;
            const existing = document.getElementById(linkId);

            if (tema === 'defecto') {
                if (existing) existing.remove();
                return;
            }

            const cssURL = chrome.runtime.getURL(`themes/${tema}.css`);
            if (existing) {
                if (existing.href !== cssURL) existing.href = cssURL;
            } else {
                const link = document.createElement('link');
                link.id = linkId;
                link.rel = 'stylesheet';
                link.type = 'text/css';
                link.href = cssURL;
                (document.head || document.documentElement).appendChild(link);
            }

            if (tema === 'first-blood') {
                this.applyFirstBloodDropsFallback();
            }
        });
    },

	applyFirstBloodDropsFallback: function() {
        document.querySelectorAll('button.largeButton, a.largeButton').forEach((boton) => {
            if (boton.querySelector('.drop')) return;

            for (let i = 0; i < 5; i++) {
                const drop = document.createElement('span');
                drop.className = 'drop';
                boton.appendChild(drop);
            }
        });
    },

    /**
     * Monta el acceso FABXtension dentro del menú del foro.
     */
	initThemeMenuInFab: function() {
        this.mountThemeMenuInFab();

        if (!document.body.dataset.fabxInitRetryHook) {
            document.body.dataset.fabxInitRetryHook = '1';
            // Algunas vistas montan el menú tras pequeños retrasos o cambios de layout.
            let retries = 0;
            const intervalId = setInterval(() => {
                retries += 1;
                this.mountThemeMenuInFab();
                if (retries >= 50) {
                    clearInterval(intervalId);
                }
            }, 200);
        }

        if (!document.body.dataset.fabxMobileMenuHook) {
            document.body.dataset.fabxMobileMenuHook = '1';
            document.addEventListener('click', (e) => {
                const trigger = e.target.closest('a[href="#mainmenu"], a[href$="#mainmenu"]');
                if (!trigger) return;

                // Reintento breve tras abrir el drawer, ya que mmenu suele montar paneles de forma diferida.
                let attempts = 0;
                const clickRetryId = setInterval(() => {
                    attempts += 1;
                    if (this.mountThemeMenuInFab() || attempts >= 15) {
                        clearInterval(clickRetryId);
                    }
                }, 120);
            });

            const observer = new MutationObserver(() => {
                this.mountThemeMenuInFab();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    },

    /**
     * Inserta un botón FABXtension en el menú principal y un popup desplegable con opciones.
     */
	mountThemeMenuInFab: function() {
        if (window.top !== window.self) return;
        const userMenu = document.getElementById('ForoMenuUsuario');
    const mobileDrawerMenu = document.querySelector(
        '#mainmenu ul.mm-list.mm-panel.mm-opened.mm-current, #mainmenu ul.mm-list.mm-panel:first-of-type'
    );
        if (!userMenu && !mobileDrawerMenu) return false;

        const temas = [
            { value: 'defecto', label: t('menuDefaultTitle', 'Por defecto') },
            { value: 'marfil', label: 'marfil' },
            { value: 'camuflaje', label: 'camuflaje' },
            { value: 'first-blood', label: 'first blood' }
        ];

        const popupExists = document.getElementById('fabxtension-menu-popup');
        let popup = popupExists;
        let select = document.getElementById('fabxtension-theme-select');

        const syncSelectWithStorage = () => {
            if (!select) return;
            chrome.storage.local.get({ temaActivo: 'defecto' }, (data) => {
                select.value = data.temaActivo;
            });
        };

        const closePopup = () => {
            if (popup) popup.style.display = 'none';
        };

        const openPopupForTrigger = (trigger) => {
            if (!popup) return;
            syncSelectWithStorage();

            const rect = trigger.getBoundingClientRect();

            popup.style.visibility = 'hidden';
            popup.style.display = 'block';

            const popupWidth = popup.offsetWidth || 240;
            const popupHeight = popup.offsetHeight || 140;
            const gap = 6;
            const minEdge = 8;

            const maxLeft = Math.max(minEdge, window.innerWidth - popupWidth - minEdge);
            const left = Math.min(Math.max(minEdge, rect.left), maxLeft);

            const preferredTop = rect.bottom + gap;
            const maxTop = window.innerHeight - popupHeight - minEdge;
            const top = preferredTop <= maxTop ? preferredTop : Math.max(minEdge, rect.top - popupHeight - gap);

            popup.style.left = `${Math.round(left)}px`;
            popup.style.top = `${Math.round(top)}px`;
            popup.style.visibility = 'visible';
            popup.style.display = 'block';
        };

        const bindTrigger = (trigger) => {
            if (!trigger || trigger.dataset.fabxMenuBound === '1') return;

            trigger.dataset.fabxMenuBound = '1';
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const isOpen = popup && popup.style.display === 'block';
                if (isOpen) {
                    closePopup();
                    return;
                }
                openPopupForTrigger(trigger);
            });
        };

        if (userMenu) {
            const desktopLinksContainer = userMenu.querySelector('.onlyDesktop .linksContainer');
            if (desktopLinksContainer && !document.getElementById('fabxtension-menu-trigger-desktop')) {
                const desktopSlot = document.createElement('div');
                const desktopTrigger = document.createElement('a');
                desktopTrigger.id = 'fabxtension-menu-trigger-desktop';
                desktopTrigger.href = 'javascript:;';
                desktopTrigger.className = 'softButton';
                desktopTrigger.title = t('fabxOptionsTitle', 'Opciones de FABXtension');
                desktopTrigger.textContent = 'FABXtension';
                desktopSlot.appendChild(desktopTrigger);
                desktopLinksContainer.appendChild(desktopSlot);
            }
        }

        if (mobileDrawerMenu && !document.getElementById('fabxtension-menu-trigger-mobile-drawer')) {
            const li = document.createElement('li');
            li.id = 'fabxtension-menu-item-mobile-drawer';

            const drawerTrigger = document.createElement('a');
            drawerTrigger.id = 'fabxtension-menu-trigger-mobile-drawer';
            drawerTrigger.href = 'javascript:;';
            drawerTrigger.innerHTML = '<i class="fas fa-sliders-h fa-lg fa-fw"></i> FABXtension';

            li.appendChild(drawerTrigger);
            mobileDrawerMenu.appendChild(li);
        }

        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'fabxtension-menu-popup';
            popup.className = 'tabla';
            Object.assign(popup.style, {
                position: 'fixed',
                display: 'none',
                width: '240px',
                maxWidth: '92vw',
                boxSizing: 'border-box',
                zIndex: '2147483647',
                padding: '8px'
            });

            const popupContent = document.createElement('div');
            popupContent.id = 'fabxtension-menu-content';
            popupContent.className = 'tablaRow';
            Object.assign(popupContent.style, {
                padding: '6px'
            });

            const label = document.createElement('label');
            label.htmlFor = 'fabxtension-theme-select';
            label.textContent = t('themeLabel', 'Tema:');
            label.className = 'boxTitle';
            Object.assign(label.style, {
                display: 'block',
                marginBottom: '6px'
            });

            select = document.createElement('select');
            select.id = 'fabxtension-theme-select';
            select.className = 'tabla_input';
            Object.assign(select.style, {
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                display: 'block'
            });

            temas.forEach((tema) => {
                const option = document.createElement('option');
                option.value = tema.value;
                option.textContent = tema.label;
                select.appendChild(option);
            });

            select.addEventListener('change', () => {
                const nuevoTema = select.value;
                chrome.storage.local.set({ temaActivo: nuevoTema }, () => {
                    window.location.reload();
                });
            });

            popup.addEventListener('click', (e) => e.stopPropagation());

            document.addEventListener('click', () => {
                closePopup();
            });

            window.addEventListener('resize', () => {
                closePopup();
            });

            popupContent.appendChild(label);
            popupContent.appendChild(select);
            popup.appendChild(popupContent);

            document.body.appendChild(popup);
        }

        bindTrigger(document.getElementById('fabxtension-menu-trigger-desktop'));
        bindTrigger(document.getElementById('fabxtension-menu-trigger-mobile-drawer'));

        syncSelectWithStorage();
        return true;
    },
    
    /**
     * Enrutador de URL modular
     * Permite añadir sub-módulos fácilmente sin alterar el flujo principal
     */
	router: function(url) {
        if (url.includes('/new-messages/')) {
            this.modules.newMessages(url);
        } 
        else if (url.includes('/post.php?')) {
            this.modules.postEditor(url);
        }
    },
    
    /**
     * Contenedor de submódulos específicos del foro
     */
	modules: {
        newMessages: function(url) { console.log("[FAB] Módulo: Nuevos Mensajes"); },
        
        postEditor: function(url) { 
            console.log("[FAB] Módulo: Editor de Posts (TinyMCE) dinámico"); 

            // 1. Buscamos el iframe con nuestro vigilante
            const buscarIframe = setInterval(() => {
                const iframe = document.getElementById('tinyMCE_texto_ifr');
                
                if (iframe) {
                    clearInterval(buscarIframe);

                    // 2. Preguntamos al almacenamiento local qué tema se está usando ahora mismo
                    chrome.storage.local.get({ temaActivo: "defecto" }, (data) => {
                        const tema = data.temaActivo;
                        if (tema === "defecto") return; // Si es el de serie, no tocamos nada

                        // 3. Si ya está cargado el iframe, disparamos; si no, esperamos a que cargue
                        const docInterno = iframe.contentDocument || iframe.contentWindow.document;
                        if (docInterno && docInterno.body && docInterno.readyState === 'complete') {
                            this.vincularCSSAlEditor(iframe, tema);
                        } else {
                            iframe.addEventListener('load', () => {
                                this.vincularCSSAlEditor(iframe, tema);
                            });
                        }
                    });
                }
            }, 100);
            
			// NUEVO: Vigilante para la Barra de Herramientas 2 (Emoticonos)
            const buscarToolbar = setInterval(() => {
                const mceToolbarRow = this.obtenerFilaToolbarFAB();
                
                if (mceToolbarRow) {
                    clearInterval(buscarToolbar);
                    this.prepararKitEmoticonos(mceToolbarRow);
                }
            }, 100);
        },

        esFirefoxMobile: function() {
            const ua = navigator.userAgent || '';
            return /Firefox/i.test(ua) && /(Mobile|Android|Fennec|Tablet)/i.test(ua);
        },

        obtenerFilaToolbarFAB: function() {
            if (this.esFirefoxMobile()) {
                const filaMovil = this.asegurarToolbarFABMobile();
                if (filaMovil) return filaMovil;
            }

            return document.querySelector('#tinyMCE_texto_toolbar2 tbody tr');
        },

        asegurarToolbarFABMobile: function() {
            const toolbar2 = document.getElementById('tinyMCE_texto_toolbar2');
            if (!toolbar2 || !toolbar2.parentNode) return null;

            let toolbar3 = document.getElementById('fab_tinyMCE_texto_toolbar3');
            if (!toolbar3) {
                toolbar3 = document.createElement('table');
                toolbar3.id = 'fab_tinyMCE_texto_toolbar3';
                toolbar3.className = toolbar2.className || 'mceToolbar mceToolbarRow3 Enabled';
                toolbar3.setAttribute('cellpadding', toolbar2.getAttribute('cellpadding') || '0');
                toolbar3.setAttribute('cellspacing', toolbar2.getAttribute('cellspacing') || '0');
                toolbar3.setAttribute('align', toolbar2.getAttribute('align') || '');
                toolbar3.setAttribute('role', toolbar2.getAttribute('role') || 'presentation');
                toolbar3.setAttribute('tabindex', toolbar2.getAttribute('tabindex') || '-1');
                toolbar3.setAttribute('aria-disabled', toolbar2.getAttribute('aria-disabled') || 'false');
                toolbar3.setAttribute('aria-pressed', toolbar2.getAttribute('aria-pressed') || 'false');

                const tbody = document.createElement('tbody');
                const row = document.createElement('tr');

                const start = document.createElement('td');
                start.className = 'mceToolbarStart mceToolbarStartButton mceFirst';
                start.innerHTML = '<span></span>';

                const end = document.createElement('td');
                end.className = 'mceToolbarEnd mceToolbarEndButton mceLast';
                end.innerHTML = '<span></span>';

                row.appendChild(start);
                row.appendChild(end);
                tbody.appendChild(row);
                toolbar3.appendChild(tbody);

                toolbar2.parentNode.insertBefore(toolbar3, toolbar2.nextSibling);
                console.log('[FAB] Toolbar FAB móvil creada tras #tinyMCE_texto_toolbar2');
            }

            return toolbar3.querySelector('tbody tr');
        },

        insertarEnToolbar: function(toolbarRow, celda) {
            const endCell = toolbarRow.querySelector('td.mceToolbarEnd');
            if (endCell) {
                toolbarRow.insertBefore(celda, endCell);
                return;
            }
            toolbarRow.appendChild(celda);
        },

        /**
         * Lee el JSON e inyecta el botón personalizado en la barra de herramientas
         */
        prepararKitEmoticonos: function(toolbarRow) {
			// ESCUDO ANTIDUPLICADO: Si el botón ya existe en la barra, salimos corriendo
            if (document.getElementById('fab_custom_emojis_btn')) {
                return;
            }
            console.log("[FAB] Fila de herramientas 2 detectada. Acoplando botón de emojis...");

            // Inserta separador visual antes del botón de emojis.
            const separadorCelda = document.createElement('td');
            separadorCelda.style.position = 'relative';

            const separador = document.createElement('span');
            separador.className = 'mceSeparator';
            separador.setAttribute('role', 'separator');
            separador.setAttribute('aria-orientation', 'vertical');
            separador.setAttribute('tabindex', '-1');

            separadorCelda.appendChild(separador);
            this.insertarEnToolbar(toolbarRow, separadorCelda);

            // 1. Creamos la celda <td> siguiendo la estructura exacta de TinyMCE
            const nuevaCelda = document.createElement('td');
            nuevaCelda.style.position = 'relative';

            // 2. Creamos el botón (usamos un emoji de nativo como icono 16x16 provisional)
            const boton = document.createElement('a');
            boton.role = 'button';
            boton.id = 'fab_custom_emojis_btn';
            boton.href = 'javascript:;';
            boton.className = 'mceButton mceButtonEnabled fab-mce-button';
            boton.title = t('emojiButtonTitle', 'Insertar Emoticonos del Kit Extendido');
            boton.style.display = 'flex';
            boton.style.alignItems = 'center';
            boton.style.justifyContent = 'center';
            boton.style.setProperty('width', 'auto', 'important');
            boton.style.setProperty('height', 'auto', 'important');
            boton.style.fontSize = '14px';
            boton.textContent = '😎'; // Icono provisional visual de 16x16 aprox.

            nuevaCelda.appendChild(boton);
            this.insertarEnToolbar(toolbarRow, nuevaCelda);

            this.agregarBotonSubidaImagen(toolbarRow, {
                id: 'fab_imgbb_upload_btn',
                title: t('imgbbUploadButtonTitle', 'Subir imagen a ImgBB'),
                iconFile: 'imgbb.png',
                provider: 'imgbb'
            });

            this.agregarBotonSubidaImagen(toolbarRow, {
                id: 'fab_postimages_upload_btn',
                title: t('postimagesUploadButtonTitle', 'Subir imagen a Postimages'),
                iconFile: 'postimages.png',
                provider: 'postimages'
            });

            // 3. Cargamos el archivo JSON de forma asíncrona desde nuestra carpeta res/
            const jsonURL = chrome.runtime.getURL('res/emojis.json');
            fetch(jsonURL)
                .then(response => response.json())
                .then(emojisData => {
                    // Creamos el panel oculto asociado a este botón
                    const popup = this.crearPanelEmojis(emojisData, boton);
                    document.body.appendChild(popup);

                    // Evento para abrir/cerrar el panel
                    const centrarPopup = () => {
                        const popupWidth = 350;
                        const centeredLeft = window.scrollX + ((window.innerWidth - popupWidth) / 2);
                        popup.style.left = `${Math.round(centeredLeft)}px`;
                    };

                    boton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const estaAbierto = popup.style.display === 'grid';
                        
                        // Cerramos todos los paneles antes de actuar
                        document.querySelectorAll('.fab-emoji-popup').forEach(p => p.style.display = 'none');
                        
                        if (!estaAbierto) {
                            // Mantenemos la Y respecto al botón, pero centramos horizontalmente en viewport.
                            const rect = boton.getBoundingClientRect();
                            popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
                            centrarPopup();
                            popup.style.display = 'grid';
                        }
                    });

                    window.addEventListener('resize', () => {
                        if (popup.style.display === 'grid') centrarPopup();
                    });
                })
                .catch(err => console.error("[FAB Error] No se pudo leer res/emojis.json:", err));

            // Cerrar el panel flotante si se hace clic en cualquier otra parte de la pantalla
            document.addEventListener('click', () => {
                document.querySelectorAll('.fab-emoji-popup').forEach(p => p.style.display = 'none');
                document.querySelectorAll('.fab-image-upload-popup').forEach(p => p.style.display = 'none');
            });
        },

        agregarBotonSubidaImagen: function(toolbarRow, config) {
            if (document.getElementById(config.id)) {
                return;
            }

            const separadorCelda = document.createElement('td');
            separadorCelda.style.position = 'relative';

            const separador = document.createElement('span');
            separador.className = 'mceSeparator';
            separador.setAttribute('role', 'separator');
            separador.setAttribute('aria-orientation', 'vertical');
            separador.setAttribute('tabindex', '-1');
            separadorCelda.appendChild(separador);
            this.insertarEnToolbar(toolbarRow, separadorCelda);

            const celda = document.createElement('td');
            celda.style.position = 'relative';

            const boton = document.createElement('a');
            boton.role = 'button';
            boton.id = config.id;
            boton.href = 'javascript:;';
            boton.className = 'mceButton mceButtonEnabled fab-mce-button';
            boton.title = config.title;
            boton.style.display = 'inline-flex';
            boton.style.alignItems = 'center';
            boton.style.justifyContent = 'center';
            boton.style.setProperty('width', 'auto', 'important');
            boton.style.setProperty('height', 'auto', 'important');
            boton.style.gap = '4px';
            boton.style.padding = '0 4px';

            const leading = document.createElement('span');
            leading.textContent = '🖼️';
            boton.appendChild(leading);

            const img = document.createElement('img');
            img.src = chrome.runtime.getURL(`res/${config.iconFile}`);
            img.alt = '';
            img.className = 'fab-upload-control-icon';
            img.style.maxHeight = '22px';
            img.style.width = 'auto';
            boton.appendChild(img);

            boton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.abrirPopupSubidaImagen(config.provider);
            });

            celda.appendChild(boton);
            this.insertarEnToolbar(toolbarRow, celda);
        },

        abrirPopupSubidaImagen: function(provider) {
            const popup = this.obtenerPopupSubidaImagen();
            const titleEl = popup.querySelector('[data-fab-upload-title]');
            const statusEl = popup.querySelector('[data-fab-upload-status]');

            titleEl.textContent = provider === 'imgbb'
                ? t('imgbbUploadButtonTitle', 'Subir imagen a ImgBB')
                : t('postimagesUploadButtonTitle', 'Subir imagen a Postimages');
            statusEl.textContent = '';
            popup.dataset.provider = provider;
            popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
        },

        obtenerPopupSubidaImagen: function() {
            let popup = document.getElementById('fab-image-upload-popup');
            if (popup) return popup;

            popup = document.createElement('div');
            popup.id = 'fab-image-upload-popup';
            popup.className = 'fab-image-upload-popup tabla';
            popup.style.display = 'none';
            Object.assign(popup.style, {
                position: 'fixed',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '200px',
                height: '200px',
                zIndex: '2147483647',
                border: '1px solid #999',
                borderRadius: '6px',
                backgroundColor: '#f0f0f0',
                color: '#000',
                boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                overflow: 'hidden',
                boxSizing: 'border-box'
            });

            const box = document.createElement('div');
            Object.assign(box.style, {
                width: '100%',
                height: '100%',
                padding: '8px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                textAlign: 'center',
                color: '#000'
            });

            const title = document.createElement('div');
            title.setAttribute('data-fab-upload-title', '1');
            title.style.fontSize = '12px';
            title.style.fontWeight = 'bold';
            title.style.lineHeight = '1.2';

            const uploadIcon = document.createElement('img');
            uploadIcon.src = chrome.runtime.getURL('res/upload.png');
            uploadIcon.alt = '';
            uploadIcon.className = 'fab-upload-control-icon';
            uploadIcon.style.maxHeight = '42px';
            uploadIcon.style.width = 'auto';

            const msg = document.createElement('div');
            msg.textContent = t('imageUploadDropMessage', 'Arrastra, pega o clic para subir imagenes');
            msg.style.fontSize = '12px';
            msg.style.lineHeight = '1.25';

            const status = document.createElement('div');
            status.setAttribute('data-fab-upload-status', '1');
            status.style.fontSize = '11px';
            status.style.lineHeight = '1.2';

            title.style.color = '#000';
            msg.style.color = '#000';
            status.style.color = '#000';

            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.style.display = 'none';

            const processSelected = async (files) => {
                if (!files || files.length === 0) return;
                const provider = popup.dataset.provider || 'imgbb';
                status.textContent = t('imageUploadUploading', 'Subiendo...');

                try {
                    const urls = await this.subirImagenesProveedor(Array.from(files), provider);
                    if (urls.length > 0) {
                        this.inyectarImagenesEnEditor(urls);
                        popup.style.display = 'none';
                        status.textContent = '';
                    }
                } catch (err) {
                    status.textContent = `${t('imageUploadErrorPrefix', 'Error al subir')}: ${err.message || err}`;
                }
            };

            box.addEventListener('click', () => input.click());
            input.addEventListener('change', (e) => processSelected(e.target.files));

            box.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                box.style.backgroundColor = '#dce8ff';
            });

            box.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                box.style.backgroundColor = 'transparent';
            });

            box.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                box.style.backgroundColor = 'transparent';
                processSelected(e.dataTransfer.files);
            });

            document.addEventListener('paste', (e) => {
                if (popup.style.display !== 'block') return;
                const files = [];
                if (e.clipboardData && e.clipboardData.items) {
                    Array.from(e.clipboardData.items).forEach((item) => {
                        if (item.type && item.type.startsWith('image/')) {
                            const f = item.getAsFile();
                            if (f) files.push(f);
                        }
                    });
                }
                if (files.length > 0) processSelected(files);
            });

            popup.addEventListener('click', (e) => e.stopPropagation());

            box.appendChild(title);
            box.appendChild(uploadIcon);
            box.appendChild(msg);
            box.appendChild(status);
            box.appendChild(input);
            popup.appendChild(box);
            document.body.appendChild(popup);
            return popup;
        },

        subirImagenesProveedor: async function(files, provider) {
            const imageFiles = files.filter((f) => f && f.type && f.type.startsWith('image/'));
            if (imageFiles.length === 0) {
                throw new Error(t('imageUploadNoImagesError', 'No hay imagenes validas en la seleccion'));
            }
            const serializar = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve({
                    name: file.name,
                    type: file.type,
                    dataUrl: reader.result
                });
                reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
                reader.readAsDataURL(file);
            });

            const payloadFiles = await Promise.all(imageFiles.map((f) => serializar(f)));

            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'fabUploadImages',
                    provider,
                    files: payloadFiles
                }, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(result || {});
                });
            });

            if (!response.success) {
                throw new Error(response.error || t('imageUploadGenericError', 'Subida rechazada por el servicio'));
            }

            return response.urls || [];
        },

        inyectarImagenesEnEditor: function(urls) {
            try {
                const iframe = document.getElementById('tinyMCE_texto_ifr');
                if (!iframe) {
                    throw new Error(t('editorIframeError', 'No se encontro el iframe del editor'));
                }

                const docInterno = iframe.contentDocument || iframe.contentWindow.document;
                const bodyInterno = docInterno.getElementById('tinymce');
                if (bodyInterno) bodyInterno.focus();

                const html = urls.map((url) => `<p><img src="${url}" /></p>`).join('');
                docInterno.execCommand('insertHTML', false, html);
            } catch (err) {
                console.error('[FAB Error] Fallo al insertar imagenes en el editor:', err);
            }
        },

        /**
         * Construye el elemento HTML del panel flotante con la lista de emojis
         */
        crearPanelEmojis: function(emojis, botonOrigen) {
            const popup = document.createElement('div');
            popup.className = 'fab-emoji-popup';
            popup.style.display = 'none';
            Object.assign(popup.style, {
                position: 'absolute',
                width: '370px',
                maxWidth: '92vw',
                maxHeight: '350px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #999',
                boxShadow: '0px 4px 10px rgba(0,0,0,0.2)',
                zIndex: '200000',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '6px',
                padding: '8px',
                overflowY: 'auto',
                borderRadius: '4px',
                boxSizing: 'border-box'
            });

            // Evitamos que hacer clic dentro del panel lo cierre solo
            popup.addEventListener('click', (e) => e.stopPropagation());

            // Recorremos el JSON que editaste para pintar las casillas
            emojis.forEach(emoji => {
                const item = document.createElement('div');
                item.className = 'fab-emoji-item';
                item.title = emoji.alt;
                Object.assign(item.style, {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    cursor: 'pointer',
                    border: '1px solid transparent',
                    borderRadius: '4px',
                    backgroundColor: '#fff'
                });

                const img = document.createElement('img');
                img.src = emoji.url;
                img.alt = emoji.alt;
                Object.assign(img.style, {
                    maxWidth: '32px',
                    maxHeight: '32px',
                    objectFit: 'contain'
                });

                item.appendChild(img);
                popup.appendChild(item);

                // ACCIÓN CRUCIAL: Al clickar el emoji, lo inyectamos en TinyMCE
                item.addEventListener('click', () => {
                    this.inyectarEmojiEnEditor(emoji);
                    popup.style.display = 'none'; // Cerramos el panel tras insertar
                });
            });

            return popup;
        },

        /**
         * Usa la API nativa de TinyMCE que miarroba tiene expuesta globalmente
         * para clavar el HTML exacto de la imagen donde apunte el cursor.
         */
		/**
         * Burla el aislamiento de Chrome inyectando un script directamente en la página real
         */
         
		/**
         * Inyecta el emoji de forma directa en el HTML del iframe usando comandos nativos del navegador
         */
        inyectarEmojiEnEditor: function(emoji) {
            try {
                // 1. Buscamos el iframe de Miarroba
                const iframe = document.getElementById('tinyMCE_texto_ifr');
                if (!iframe) {
                    console.error("[FAB Error] No se encontró el iframe del editor.");
                    return;
                }

                // 2. Accedemos al documento interno del iframe
                const docInterno = iframe.contentDocument || iframe.contentWindow.document;
                
                // 3. Forzamos el foco dentro del cuadro de texto para que sepa dónde meterlo
                const bodyInterno = docInterno.getElementById('tinymce');
                if (bodyInterno) {
                    bodyInterno.focus();
                }

                // 4. Generamos el HTML exacto de la imagen
                const htmlEmoticono = `<img class="caretoMia" style="border: 0px; width: ${emoji.w}px; height: ${emoji.h}px;" src="${emoji.url}" alt="${emoji.alt}" />`;

                // 5. Usamos el comando de inserción nativo de Chrome sobre el documento del iframe
                // Esto no usa la API de TinyMCE, usa el motor del propio navegador. ¡Inmune a bloqueos!
                docInterno.execCommand('insertHTML', false, htmlEmoticono);
                
                console.log(`[FAB] Emoticono ${emoji.alt} estampado directamente en el iframe.`);

            } catch (err) {
                console.error("[FAB Error] Fallo al insertar emoji en el iframe:", err);
            }
        },
                
        /**
         * Inyecta un <link> físico dentro del iframe apuntando al CSS del tema actual
         */
        vincularCSSAlEditor: function(iframe, nombreTema) {
            try {
                const docInterno = iframe.contentDocument || iframe.contentWindow.document;
                
                // Evitamos duplicar la etiqueta si ya la habíamos metido
                if (docInterno.getElementById('fab-css-iframe-tema')) return;

                // 1. Generamos la URL real y absoluta de tu archivo (ej: themes/blanco.css)
                const cssURL = chrome.runtime.getURL(`themes/${nombreTema}.css`);

                // 2. Creamos la etiqueta <link> clásica de HTML
                const link = docInterno.createElement("link");
                link.rel = "stylesheet";
                link.type = "text/css";
                link.href = cssURL;
                link.id = "fab-css-iframe-tema";

                // 3. La clavamos en el <head> del iframe
                (docInterno.head || docInterno.documentElement).appendChild(link);
                console.log(`[FAB] Hoja de estilos "${nombreTema}.css" vinculada con éxito dentro del editor.`);

            } catch (error) {
                console.error("[FAB Error] Fallo al vincular CSS en el iframe:", error);
            }
        }
    },
     
	/**
     * Interactividad blindada mediante una máscara de control estática
     */
	isImagenDePostPublicado: function(img) {
        let parent = img ? img.parentElement : null;
        let depth = 0;

        while (parent && depth < 4) {
            if (parent.tagName === 'DIV' && parent.classList.contains('contenido_msg')) {
                return true;
            }
            parent = parent.parentElement;
            depth += 1;
        }

        return false;
    },

	initImageInteractivity: function() {
        this.log("Iniciando escucha mediante máscara estática...");

        document.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;

            // NUEVO FILTRO: Si el clic ocurre dentro de nuestro panel de emojis, NO HACEMOS ZOOM
            if (e.target.closest('.fab-emoji-popup')) {
                this.log("Clic en emoji del panel detectado. Ignorando módulo de zoom.");
                return; 
            }

            // Evita zoom dentro del popup de subida y sobre sus iconos de control.
            if (e.target.closest('.fab-image-upload-popup') || e.target.closest('.fab-upload-control-icon')) {
                return;
            }

            const mascara = e.target.closest('.fab-img-mask');
            const img = e.target.closest('img');

            if ((!img && !mascara) || (img && img.closest('a'))) return;

            if (img && !this.isImagenDePostPublicado(img)) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            if (mascara && mascara.dataset.zoomActivo === "true") {
                this.resetZoom(mascara);
                return;
            }

            if (img && !img.classList.contains('fab-img-target')) {
                this.toggleZoom(img, e);
            }
        }, true);
    },
    
    /**
     * Enuelve la imagen y aplica la ampliación sin mover la zona de clic
     */
    toggleZoom: function(img, event) {
        const naturalWidth = img.naturalWidth;
        const currentWidth = img.clientWidth;

        if (naturalWidth <= currentWidth) return; // Ya está a tamaño real

        const scaleFactor = naturalWidth / currentWidth;

        // Coordenadas del cursor para el punto de origen
        const rect = img.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        const originX = (clickX / rect.width) * 100;
        const originY = (clickY / rect.height) * 100;

        // 1. Creamos el contenedor principal (Base fija en el post)
        const wrapper = document.createElement('div');
        wrapper.classList.add('fab-img-wrapper');
        
        // 2. Creamos la Máscara de Control (El botón invisible que nunca se mueve)
        const mascara = document.createElement('div');
        mascara.classList.add('fab-img-mask');
        
		// Estilos de la base fija (El marco del cuadro que recorta el desborde)
        Object.assign(wrapper.style, {
            display: window.getComputedStyle(img).display === 'block' ? 'block' : 'inline-block',
            width: img.offsetWidth + 'px',
            height: img.offsetHeight + 'px',
            position: 'relative',
            overflow: 'hidden', // <-- ¡EL TRUCO CRUCIAL! Esto hace de guillotina para el zoom
            margin: window.getComputedStyle(img).margin,
            float: window.getComputedStyle(img).float,
            verticalAlign: window.getComputedStyle(img).verticalAlign || 'middle',
            zIndex: '99999' // Elevamos el marco para que no lo tapen otros elementos del foro al ampliar por dentro
        });
        
        // Estilos de la Máscara Invisible Superior (Donde daremos los clics)
        Object.assign(mascara.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            zIndex: '100000', // Por encima de todo para recibir los clics
            cursor: 'zoom-out',
            backgroundColor: 'transparent' // Totalmente invisible
        });

        // Modificamos el árbol HTML: metemos el wrapper antes de la imagen
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
        wrapper.appendChild(mascara); // Metemos el botón invisible encima

        // Estilos de la imagen para que responda a la transformación por hardware
        img.classList.add('fab-img-target');
        Object.assign(img.style, {
            width: '100%',
            height: '100%',
            display: 'block',
            margin: '0',
            transition: 'transform 0.25s ease-out',
            transformOrigin: `${originX}% ${originY}%`,
            position: 'relative',
            zIndex: '99999', // Justo debajo de la máscara
            pointerEvents: 'none' // La imagen real se vuelve fantasma
        });

        // Guardamos el enlace en la máscara para poder encoger la imagen luego
        mascara.imagenAsociada = img;
        mascara.dataset.zoomActivo = "true";

        // ¡ Lanzamos el zoom exclusivamente sobre el nodo de la imagen !
        img.style.transform = `scale(${scaleFactor})`;
        this.log("Zoom aplicado.");
    },

    /**
     * Devuelve la imagen interna a su escala normal
     */
    resetZoom: function(mascara) {
        const img = mascara.imagenAsociada;
        if (!img) return;

        img.style.transform = 'scale(1)';
        mascara.dataset.zoomActivo = "false";
        mascara.style.cursor = 'zoom-in';
        this.log("Zoom retirado.");
        
        // Destruimos la estructura para dejar el HTML del foro limpio como al principio
        setTimeout(() => {
            if (mascara.dataset.zoomActivo !== "true" && img.parentNode) {
                const wrapper = img.parentNode;
                img.classList.remove('fab-img-target');
                img.style.transform = '';
                img.style.transformOrigin = '';
                img.style.zIndex = '';
                img.style.pointerEvents = '';
                
                // Devolvemos la imagen a su sitio original en el foro y borramos los divs
                wrapper.parentNode.insertBefore(img, wrapper);
                wrapper.remove();
            }
        }, 250); // Esperamos a que acabe la animación visual para limpiar el DOM
    },
            
    /**
     * Canal de escucha para acciones procedentes de las opciones del menú contextual (events.js)
     */
    initExtensionListener: function() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.log("Mensaje recibido desde el background script:", message);
            
            // Aquí puedes mapear futuras funciones que lances desde el menú de la extensión
            if (message.action === "ejecutar_funcion_dummy") {
                // Tu código aquí...
            }
        });
    },

    /**
     * Helper de logs controlado
     */
    log: function(...args) {
        if (this.config.debug) {
            console.log("%c[FABXTension]", "color: #ff9900; font-weight: bold;", ...args);
        }
    }
};

// Ejecución segura respetando el ciclo de vida manifest_start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FABXTension.init());
} else {
    FABXTension.init();
}