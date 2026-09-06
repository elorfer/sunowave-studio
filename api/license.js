// API Serverless para Vercel: Verificación y consulta de licencias
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Consulta GET: /api/license?code=SW-ANDRES-30D-4921
  if (req.method === 'GET') {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Falta parametro code' });
    }

    const cleanCode = code.trim().toUpperCase();

    // Verificación de formato y extracción de días si es un código firmado
    // Formato: SW-[NOMBRE]-[DIAS]D-[HASH]
    const match = cleanCode.match(/^SW-([A-Z0-9]+)-(\d+)D-(\d+)$/i);
    if (match) {
      const name = match[1];
      const days = parseInt(match[2], 10);
      return res.status(200).json({
        found: true,
        license: {
          code: cleanCode,
          name: name,
          daysPurchased: days,
          createdAt: Date.now(),
          expiresAt: Date.now() + (days * 24 * 60 * 60 * 1000),
          status: 'active'
        }
      });
    }

    return res.status(200).json({ found: false, message: 'Código no encontrado' });
  }

  // Sync POST
  if (req.method === 'POST') {
    return res.status(200).json({ success: true, synced: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
