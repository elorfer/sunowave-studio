/**
 * SunoWave Studio - Servicio de Licencias y Suscripciones
 * Maneja la validación de códigos, cálculo de días restantes y sincronización
 */

const LicenseService = {
  STORAGE_KEY: 'sunowave_license_session',
  LICENSES_STORE_KEY: 'sunowave_all_licenses',
  SETTINGS_STORE_KEY: 'sunowave_admin_settings',

  // Configuración por defecto
  DEFAULT_SETTINGS: {
    usdPrice: 10,
    copExchangeRate: 4100, // 1 USD = 4.100 COP (ajustable en admin)
    whatsappNumber: '573001234567',
    adminPasswordHash: 'admin2026' // Clave por defecto para /adminsunoapp
  },

  /**
   * Obtiene la configuración de precios y tasas
   */
  getSettings() {
    try {
      const saved = localStorage.getItem(this.SETTINGS_STORE_KEY);
      if (saved) return { ...this.DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {}
    return { ...this.DEFAULT_SETTINGS };
  },

  /**
   * Guarda configuración administrativa
   */
  saveSettings(settings) {
    localStorage.setItem(this.SETTINGS_STORE_KEY, JSON.stringify(settings));
  },

  /**
   * Calcula el precio formateado en USD y COP
   */
  getFormattedPricing() {
    const s = this.getSettings();
    const copPrice = Math.round(s.usdPrice * s.copExchangeRate);
    return {
      usd: `$${s.usdPrice} USD`,
      cop: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(copPrice),
      copRaw: copPrice,
      usdRaw: s.usdPrice
    };
  },

  /**
   * Genera un código de licencia seguro para un usuario
   * Formato: SW-[NOMBRE]-[DIAS]D-[HASH]
   */
  generateCode(name, days = 30) {
    const cleanName = (name || 'USER').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const rand = Math.floor(1000 + Math.random() * 9000);
    const code = `SW-${cleanName}-${days}D-${rand}`;
    
    const now = Date.now();
    const expiresAt = now + (days * 24 * 60 * 60 * 1000);

    const licenseObj = {
      code,
      name: name.trim(),
      daysPurchased: days,
      createdAt: now,
      expiresAt,
      status: 'active',
      lastUsed: null
    };

    this.saveLicenseToRegistry(licenseObj);
    return licenseObj;
  },

  /**
   * Guarda o actualiza una licencia en el registro central
   */
  saveLicenseToRegistry(lic) {
    const all = this.getAllLicenses();
    const idx = all.findIndex(l => l.code.toUpperCase() === lic.code.toUpperCase());
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...lic };
    } else {
      all.push(lic);
    }
    localStorage.setItem(this.LICENSES_STORE_KEY, JSON.stringify(all));
    
    // Sincronizar con la API si está disponible
    this.syncToServer(all);
  },

  /**
   * Obtiene todas las licencias registradas (para el panel admin)
   */
  getAllLicenses() {
    try {
      const data = localStorage.getItem(this.LICENSES_STORE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {}

    // Licencias iniciales de demostración
    const initial = [
      {
        code: 'SW-DEMO-30D-7788',
        name: 'Demo Hermano',
        daysPurchased: 30,
        createdAt: Date.now() - (2 * 24 * 60 * 60 * 1000),
        expiresAt: Date.now() + (28 * 24 * 60 * 60 * 1000),
        status: 'active',
        lastUsed: Date.now()
      }
    ];
    localStorage.setItem(this.LICENSES_STORE_KEY, JSON.stringify(initial));
    return initial;
  },

  /**
   * Calcula los días restantes de una licencia
   */
  getRemainingDays(expiresAt) {
    const msRemaining = expiresAt - Date.now();
    if (msRemaining <= 0) return 0;
    return Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
  },

  /**
   * Valida un código de licencia ingresado por el usuario
   * @param {string} code - Código a verificar
   * @returns {Object} Resultado de la validación
   */
  async validateCode(code) {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) {
      return { valid: false, message: 'Por favor ingresa un código de acceso.' };
    }

    // Intentar buscar en registro local
    const all = this.getAllLicenses();
    let lic = all.find(l => l.code.toUpperCase() === cleanCode);

    // Si no está en local, intentar verificar en la API del servidor
    if (!lic) {
      try {
        const res = await fetch(`/api/license?code=${encodeURIComponent(cleanCode)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.found) {
            lic = data.license;
            this.saveLicenseToRegistry(lic);
          }
        }
      } catch (e) {}
    }

    // Si no está en registro ni en API, verificar formato algorítmico auto-validable SW-[NOMBRE]-[DIAS]D-[HASH]
    if (!lic) {
      const match = cleanCode.match(/^SW-([A-Z0-9]+)-(\d+)D-(\d{4})$/);
      if (match) {
        const rawName = match[1];
        const days = parseInt(match[2], 10) || 30;
        const formattedName = rawName.charAt(0) + rawName.slice(1).toLowerCase();
        
        lic = {
          code: cleanCode,
          name: formattedName,
          daysPurchased: days,
          createdAt: Date.now(),
          expiresAt: Date.now() + (days * 24 * 60 * 60 * 1000),
          status: 'active',
          lastUsed: Date.now()
        };
        this.saveLicenseToRegistry(lic);
      }
    }

    if (!lic) {
      return { 
        valid: false, 
        message: 'Código de acceso no reconocido. Verifica que esté bien escrito o solicita uno nuevo.' 
      };
    }

    if (lic.status === 'revoked' || lic.status === 'paused') {
      return { 
        valid: false, 
        message: 'Esta suscripción se encuentra pausada o revocada. Contacta al administrador.' 
      };
    }

    const remainingDays = this.getRemainingDays(lic.expiresAt);

    if (remainingDays <= 0) {
      return { 
        valid: false, 
        expired: true,
        message: `Tu suscripción de $10 USD para ${lic.name} ha vencido. Por favor renueva tu membresía para continuar usando SunoWave.` 
      };
    }

    // Actualizar último uso
    lic.lastUsed = Date.now();
    this.saveLicenseToRegistry(lic);

    // Guardar sesión activa
    const session = {
      code: lic.code,
      name: lic.name,
      expiresAt: lic.expiresAt,
      remainingDays
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));

    return {
      valid: true,
      license: lic,
      remainingDays,
      name: lic.name,
      message: `¡Bienvenido ${lic.name}! Tienes ${remainingDays} días de acceso activo.`
    };
  },

  /**
   * Obtiene la sesión de licencia actualmente activa en el navegador
   */
  getCurrentSession() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return null;
      const session = JSON.parse(data);
      const remainingDays = this.getRemainingDays(session.expiresAt);
      
      if (remainingDays <= 0) {
        return { ...session, remainingDays: 0, expired: true };
      }
      return { ...session, remainingDays, expired: false };
    } catch (e) {
      return null;
    }
  },

  /**
   * Cierra la sesión activa de la licencia
   */
  clearSession() {
    localStorage.removeItem(this.STORAGE_KEY);
  },

  /**
   * Extiende la duración de una licencia en N días (ej: +30 días por renovación)
   */
  extendLicense(code, daysToAdd = 30) {
    const all = this.getAllLicenses();
    const lic = all.find(l => l.code.toUpperCase() === code.toUpperCase());
    if (!lic) return false;

    // Si ya expiró, extender a partir de hoy; si sigue activa, extender a partir del vencimiento
    const baseDate = lic.expiresAt > Date.now() ? lic.expiresAt : Date.now();
    lic.expiresAt = baseDate + (daysToAdd * 24 * 60 * 60 * 1000);
    lic.status = 'active';
    lic.daysPurchased = (lic.daysPurchased || 0) + daysToAdd;

    this.saveLicenseToRegistry(lic);

    // Si coincide con la sesión actual, actualizarla
    const current = this.getCurrentSession();
    if (current && current.code.toUpperCase() === code.toUpperCase()) {
      current.expiresAt = lic.expiresAt;
      current.remainingDays = this.getRemainingDays(lic.expiresAt);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(current));
    }

    return lic;
  },

  /**
   * Cambia el estado de una licencia (active, paused, revoked)
   */
  setLicenseStatus(code, status) {
    const all = this.getAllLicenses();
    const lic = all.find(l => l.code.toUpperCase() === code.toUpperCase());
    if (!lic) return false;
    lic.status = status;
    this.saveLicenseToRegistry(lic);
    return true;
  },

  /**
   * Elimina una licencia del registro
   */
  deleteLicense(code) {
    let all = this.getAllLicenses();
    all = all.filter(l => l.code.toUpperCase() !== code.toUpperCase());
    localStorage.setItem(this.LICENSES_STORE_KEY, JSON.stringify(all));
    this.syncToServer(all);
    return true;
  },

  /**
   * Sincroniza con el backend (servidor local o Vercel API)
   */
  async syncToServer(licenses) {
    try {
      await fetch('/api/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', licenses })
      });
    } catch (e) {}
  }
};

window.LicenseService = LicenseService;
